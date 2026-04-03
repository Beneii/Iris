#!/usr/bin/env python3
"""
Iris <-> Hermes Bridge Server (FastAPI)

Full rewrite of the original websockets bridge.
Provides HTTP REST endpoints + WebSocket with the same JSON action protocol.

Usage:
    python bridge/server.py
    # or: uvicorn bridge.server:app --host 0.0.0.0 --port 8643

Connects to http://localhost:8643
"""

import asyncio
import base64
import datetime
import json
import mimetypes
import os
import re
import socket
import socketserver
import sys
import time
import threading
import uuid
import shutil
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, UploadFile, File
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.websockets import WebSocketState

# ─── Hermes path & adapter ───
HERMES_DIR = Path.home() / "hermes-agent"
sys.path.insert(0, str(HERMES_DIR))

from hermes_adapter import HermesAdapter, get_config, get_agent_name, get_soul_content, get_memory, list_skills, get_available_toolsets, set_config_value, list_jobs, create_job, pause_job, resume_job, trigger_job, remove_job, get_job_outputs, resolve_profile_for_session
from profile_runtime import get_runtime_manager, PROFILE_NAMES
from permissions import load_permissions, save_permissions

# Session persistence via Hermes state.db (stable SQLite API)
from hermes_state import SessionDB
session_db = SessionDB()

# ─── Persistent Home session ───
HOME_SESSION_ID = "home"

# Load Hermes env
from dotenv import load_dotenv
hermes_home = Path.home() / ".hermes"
load_dotenv(hermes_home / ".env")

# ─── Config ───
PORT = int(os.environ.get("IRIS_BRIDGE_PORT", "8643"))
IRIS_API_KEY = os.environ.get("IRIS_API_KEY", "")

adapter = HermesAdapter()

# ─── State ───
clients: set[WebSocket] = set()
foreground_clients: set[WebSocket] = set()  # clients with app in foreground
sessions: dict[str, dict] = {}  # session_id -> {agent, history}
running_threads: dict[str, threading.Thread] = {}
cancel_flags: dict[str, bool] = {}
_main_loop: Optional[asyncio.AbstractEventLoop] = None
_start_time = time.time()
_RESTART_SOCKET_PATH = "/tmp/iris-profile-restart.sock"

# ─── Agent Job Queues ───
import queue as _queue_mod
from dataclasses import dataclass, field, asdict

@dataclass
class AgentJob:
    job_id: str
    profile: str
    session_id: str
    message: str
    kind: str  # "dm" | "channel"
    channel_id: Optional[str] = None
    images: Optional[list] = None
    attachments: Optional[list] = None
    submitted_at: float = field(default_factory=time.time)
    status: str = "queued"  # queued | running | done | error

agent_queues: dict[str, _queue_mod.Queue] = {}
agent_queue_workers: dict[str, threading.Thread] = {}
agent_current_job: dict[str, Optional[AgentJob]] = {}
_job_counter: int = 0

def _next_job_id() -> str:
    global _job_counter
    _job_counter += 1
    return f"job-{int(time.time())}-{_job_counter}"

def _broadcast_queue_status():
    """Emit current queue depths to all clients."""
    status = {}
    for profile in ("hermes", "talos", "icarus", "charon", "nyx"):
        q = agent_queues.get(profile)
        current = agent_current_job.get(profile)
        status[profile] = {
            "depth": q.qsize() if q else 0,
            "current_job_id": current.job_id if current else None,
            "current_session_id": current.session_id if current else None,
        }
    emit("queue.status", {"queues": status})

def _agent_queue_worker(profile: str):
    """Persistent thread per agent that drains its job queue sequentially."""
    q = agent_queues[profile]
    while True:
        job = q.get()  # blocks until job available
        agent_current_job[profile] = job
        job.status = "running"
        emit("queue.job_started", {
            "profile": profile,
            "job_id": job.job_id,
            "session_id": job.session_id,
        })
        _broadcast_queue_status()
        try:
            if job.kind == "channel":
                _run_channel_agent(job.channel_id, job.message, profile)
            else:
                run_agent_sync(job.session_id, job.message, job.images, job.attachments)
            job.status = "done"
        except Exception as e:
            job.status = "error"
            print(f"[iris-bridge] Queue worker error ({profile}): {e}", flush=True)
        finally:
            agent_current_job[profile] = None
            _broadcast_queue_status()
            q.task_done()

def _init_agent_queues():
    """Initialize queues and worker threads for all profiles."""
    for profile in ("hermes", "talos", "icarus", "charon", "nyx"):
        agent_queues[profile] = _queue_mod.Queue()
        agent_current_job[profile] = None
        t = threading.Thread(
            target=_agent_queue_worker,
            args=(profile,),
            daemon=True,
            name=f"queue-{profile}",
        )
        agent_queue_workers[profile] = t
        t.start()

# ─── Session Roster (which agents participated in each session) ───
session_roster: dict[str, set[str]] = {}  # session_id -> set of agent IDs

def _add_to_roster(session_id: str, agent_id: str):
    """Track that an agent participated in a session."""
    if session_id not in session_roster:
        session_roster[session_id] = set()
    session_roster[session_id].add(agent_id)
    emit("session.roster", {
        "session_id": session_id,
        "agents": list(session_roster[session_id]),
    })

def _get_roster(session_id: str) -> list[str]:
    return list(session_roster.get(session_id, []))

# ─── Activity persistence ───
ACTIVITY_DIR = hermes_home / "iris_activity"
ACTIVITY_DIR.mkdir(parents=True, exist_ok=True)

MEDIA_DIR = hermes_home / "iris_media"
MEDIA_DIR.mkdir(parents=True, exist_ok=True)

PUSH_TOKENS_FILE = hermes_home / "iris_push_tokens.json"

# ─── Stream accumulation (fallback when final_response is None) ───
_session_stream_buffers: dict[str, list] = {}

# ─── Image inlining ───

# Explicit MEDIA: references + common temp/screenshot paths
_MEDIA_REF_RE = re.compile(r'MEDIA:(/[^\s\)\"\'\n]+)')
_IMAGE_PATH_RE = re.compile(
    r'(?<!\w)(/(?:tmp|var/folders|private/tmp|Users/[^/\s]+/(?:Desktop|Downloads|Pictures|tmp|\.hermes))[^\s\)\"\'\n,]*\.(?:png|jpe?g|gif|webp|svg))'
)

def _inline_image(path_str: str) -> str | None:
    """Copy image to media dir and return the served URL path, or None."""
    filepath = Path(path_str.rstrip(".,;:)'\""))
    if not filepath.exists():
        return None
    mime, _ = mimetypes.guess_type(str(filepath))
    if not mime or not mime.startswith("image/"):
        return None
    try:
        ext = filepath.suffix
        name = f"{uuid.uuid4().hex}{ext}"
        dest = MEDIA_DIR / name
        shutil.copy2(str(filepath), str(dest))
        return f"/media/{name}"
    except Exception as e:
        print(f"[iris-bridge] Failed to copy image {path_str}: {e}")
        return None

def _process_media_refs(text: str, session_id: str = "") -> str:
    """Find image paths, copy to media dir, emit message.image events, strip from text."""
    try:
        def replace_and_emit(m: re.Match, is_explicit: bool = False) -> str:
            path = m.group(1)
            url = _inline_image(path)
            if url:
                # Emit image event so client can display it
                emit("message.image", {"session_id": session_id, "url": url, "alt": "Image"})
                # Remove the MEDIA: tag from text
                return "" if is_explicit else ""
            return f"*(image not found: `{path}`)*" if is_explicit else m.group(0)

        text = _MEDIA_REF_RE.sub(lambda m: replace_and_emit(m, True), text)
        text = _IMAGE_PATH_RE.sub(lambda m: replace_and_emit(m, False), text)
    except Exception as e:
        print(f"[iris-bridge] Error processing media refs: {e}")
    return text

NOTIFICATION_DIR = hermes_home / "iris_notifications"
NOTIFICATION_DIR.mkdir(parents=True, exist_ok=True)

CHANNELS_DIR = hermes_home / "iris_channels"
CHANNELS_DIR.mkdir(parents=True, exist_ok=True)

CHANNEL_META_PATH = CHANNELS_DIR / "_meta.json"

def _load_channel_meta() -> dict[str, dict]:
    """Load channel metadata (name, status, project_id, created_at, agent_ids)."""
    if CHANNEL_META_PATH.exists():
        try:
            return json.loads(CHANNEL_META_PATH.read_text())
        except Exception:
            pass
    # Bootstrap: scan existing channel JSON files + ensure general exists
    meta: dict[str, dict] = {}
    for f in CHANNELS_DIR.glob("*.json"):
        if f.name.startswith("_"):
            continue
        cid = f.stem
        meta[cid] = {"name": cid, "status": "active", "created_at": f.stat().st_mtime, "agent_ids": ["hermes"]}
    if "general" not in meta:
        meta["general"] = {"name": "general", "status": "active", "created_at": time.time(), "agent_ids": ["hermes"]}
    _save_channel_meta(meta)
    return meta

def _save_channel_meta(meta: dict[str, dict]):
    tmp = CHANNEL_META_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(meta, indent=2, default=str))
    tmp.replace(CHANNEL_META_PATH)

def _create_channel(channel_id: str, name: str = "", project_id: str = "", agent_ids: list[str] | None = None) -> dict:
    meta = _load_channel_meta()
    valid_agents = [a for a in (agent_ids or ["hermes"]) if a in PROFILE_NAMES]
    entry = {
        "name": name or channel_id,
        "status": "active",
        "project_id": project_id,
        "created_at": time.time(),
        "agent_ids": valid_agents or ["hermes"],
    }
    meta[channel_id] = entry
    _save_channel_meta(meta)
    _ensure_public_channel_session(channel_id)
    return {"id": channel_id, **entry}

def _archive_channel(channel_id: str) -> bool:
    meta = _load_channel_meta()
    if channel_id in meta:
        meta[channel_id]["status"] = "archived"
        meta[channel_id]["archived_at"] = time.time()
        _save_channel_meta(meta)
        return True
    return False

def _unarchive_channel(channel_id: str) -> bool:
    meta = _load_channel_meta()
    if channel_id in meta:
        meta[channel_id]["status"] = "active"
        meta[channel_id].pop("archived_at", None)
        _save_channel_meta(meta)
        return True
    return False

def _list_channels() -> list[dict]:
    meta = _load_channel_meta()
    result = []
    for cid, info in meta.items():
        result.append({"id": cid, **info})
    return result


def _channel_agent_ids(channel_id: str) -> list[str]:
    meta = _load_channel_meta()
    info = meta.get(channel_id, {})
    ids = info.get("agent_ids") or ["hermes"]
    return [a for a in ids if a in PROFILE_NAMES] or ["hermes"]

session_activities: dict[str, list] = {}
channel_private_histories: dict[str, list] = {}


def _channel_path(channel_id: str) -> Path:
    safe = re.sub(r"[^a-zA-Z0-9._-]", "_", channel_id)
    return CHANNELS_DIR / f"{safe}.json"


def _load_channel_messages(channel_id: str) -> list[dict]:
    path = _channel_path(channel_id)
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text())
        return data if isinstance(data, list) else []
    except Exception as e:
        print(f"[iris-bridge] Failed to load channel transcript for {channel_id}: {e}")
        return []


def _save_channel_messages(channel_id: str, messages: list[dict]) -> None:
    path = _channel_path(channel_id)
    tmp = path.with_suffix(path.suffix + ".tmp")
    try:
        tmp.write_text(json.dumps(messages, default=str))
        tmp.replace(path)
    except Exception as e:
        print(f"[iris-bridge] Failed to save channel transcript for {channel_id}: {e}")


def _ensure_public_channel_session(channel_id: str) -> None:
    try:
        existing = session_db.get_session_title(channel_id)
        if existing is None:
            cfg = _get_model_info()
            session_db.create_session(session_id=channel_id, source="iris", model=cfg["model"])
    except Exception:
        pass


def _append_channel_message(channel_id: str, role: str, content: str, agent_id: str | None = None) -> None:
    msgs = _load_channel_messages(channel_id)
    msgs.append({
        "id": uuid.uuid4().hex,
        "role": role,
        "content": content,
        "timestamp": time.time(),
        "agentId": agent_id,
    })
    _save_channel_messages(channel_id, msgs)


def _recent_channel_context(channel_id: str, limit: int = 18) -> str:
    msgs = _load_channel_messages(channel_id)[-limit:]
    lines = []
    for m in msgs:
        role = m.get("role", "assistant")
        content = str(m.get("content", "")).strip()
        if not content:
            continue
        if role == "user":
            author = "user"
        elif role == "divider":
            author = "divider"
        else:
            author = m.get("agentId") or "hermes"
        lines.append(f"[{author}] {content}")
    return "\n".join(lines)


def _extract_agent_mentions(text: str) -> tuple[list[str], str]:
    mentions = re.findall(r"@([a-zA-Z0-9_-]+)", text)
    agent_mentions = [m.lower() for m in mentions if m.lower() in PROFILE_NAMES]
    if not agent_mentions:
        return [], text.strip()
    stripped = re.sub(r"(?:^|\s)@(?:hermes|talos|icarus|charon|nyx)\b", "", text, flags=re.IGNORECASE).strip()
    return list(dict.fromkeys(agent_mentions)), stripped or text.strip()


def _run_channel_agent(channel_id: str, prompt_text: str, agent_id: str) -> None:
    runtime_manager = get_runtime_manager()
    public_context = _recent_channel_context(channel_id)

    try:
        private_session_id = f"channel:{channel_id}:{agent_id}"
        channel_prompt = (
            f"You are participating in shared channel #{channel_id}.\n"
            f"Recent public channel transcript:\n{public_context or '[empty]'}\n\n"
            f"Latest addressed message:\n{prompt_text}\n\n"
            f"Reply directly. Do NOT prefix your response with your name or any label — "
            f"the UI already shows who you are. Just respond naturally."
        )

        def channel_emit(event_type: str, data: dict):
            """Proxy emit that rewrites session_id to the public channel so events show in the right chat."""
            patched = {**data, "session_id": channel_id, "agentId": agent_id}
            emit(event_type, patched)

        # Emit response.started so frontend creates a streaming placeholder
        emit("response.started", {"session_id": channel_id, "agentId": agent_id})

        result = runtime_manager.run(
            profile=agent_id,
            session_id=private_session_id,
            message=channel_prompt,
            history=channel_private_histories.get(private_session_id, []),
            emit=channel_emit,
            images=None,
            attachments=None,
        )

        if result and "messages" in result:
            channel_private_histories[private_session_id] = result["messages"]

        response = result.get("final_response", "") if result else ""
        if not response:
            emit("response.completed", {"session_id": channel_id, "final_response": "", "agentId": agent_id})
            return
        response = _process_media_refs(response, channel_id)
        _append_channel_message(channel_id, "assistant", response, agent_id)
        _add_to_roster(channel_id, agent_id)
        try:
            session_db.append_message(channel_id, "assistant", content=response)
        except Exception:
            pass

        # Emit response.completed so frontend finalizes the streaming message
        emit("response.completed", {
            "session_id": channel_id,
            "final_response": response,
            "agentId": agent_id,
            "api_calls": result.get("api_calls", 0) if result else 0,
        })

        # Agent-to-agent routing: if response mentions other agents, enqueue follow-ups
        mentioned_agents, stripped = _extract_agent_mentions(response)
        for target_agent in mentioned_agents:
            if target_agent != agent_id:
                followup = AgentJob(
                    job_id=_next_job_id(),
                    profile=target_agent,
                    session_id=channel_id,
                    message=f"[{agent_id} said]: {response}",
                    kind="channel",
                    channel_id=channel_id,
                )
                q = agent_queues.get(target_agent)
                if q:
                    q.put(followup)
                    emit("queue.job_queued", {
                        "profile": target_agent,
                        "job_id": followup.job_id,
                        "session_id": channel_id,
                        "position": q.qsize(),
                        "delegated_from": agent_id,
                    })
    except Exception as e:
        print(f"[iris-bridge] channel agent error ({agent_id} in {channel_id}): {e}", flush=True)


def _save_activities(session_id: str):
    entries = session_activities.get(session_id, [])
    if not entries:
        return
    try:
        path = ACTIVITY_DIR / f"{session_id}.json"
        path.write_text(json.dumps(entries, default=str))
    except Exception as e:
        print(f"[iris-bridge] Failed to save activities for {session_id}: {e}")


def _load_activities(session_id: str) -> list:
    try:
        path = ACTIVITY_DIR / f"{session_id}.json"
        if path.exists():
            return json.loads(path.read_text())
    except Exception as e:
        print(f"[iris-bridge] Failed to load activities for {session_id}: {e}")
    return []


ACTIVITY_EVENT_TYPES = {
    "tool.preparing", "tool.started", "memory.updated",
    "subagent.spawned", "subagent.progress", "status",
}


def record_activity(session_id: str, event: dict):
    if session_id not in session_activities:
        session_activities[session_id] = []
    session_activities[session_id].append(event)
    if len(session_activities[session_id]) % 5 == 0:
        _save_activities(session_id)


# ─── Helpers ───

def make_session_id() -> str:
    now = datetime.datetime.now()
    return f"{now.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"


def _get_model_info() -> dict:
    """Get current model/provider/base_url from adapter."""
    return adapter.reload_config()


# ─── Broadcasting ───

async def broadcast(event: dict):
    """Send a JSON event to all connected WebSocket clients."""
    msg = json.dumps(event, default=str)
    dead = set()
    for ws in clients:
        try:
            if ws.client_state == WebSocketState.CONNECTED:
                await ws.send_text(msg)
        except Exception:
            dead.add(ws)
    clients.difference_update(dead)


def emit(event_type: str, data: dict = None):
    """Emit an event from any thread. Records activity events."""
    event = {"type": event_type, "timestamp": time.time(), **(data or {})}
    if _main_loop and _main_loop.is_running():
        asyncio.run_coroutine_threadsafe(broadcast(event), _main_loop)
    if event_type in ACTIVITY_EVENT_TYPES:
        sid = (data or {}).get("session_id", "")
        if sid:
            record_activity(sid, event)
    # Accumulate streamed text so we have a fallback if final_response is None
    sid = (data or {}).get("session_id", "")
    if sid:
        if event_type == "response.started":
            _session_stream_buffers[sid] = []
        elif event_type == "message.delta":
            text = (data or {}).get("text", "")
            if text:
                _session_stream_buffers.setdefault(sid, []).append(text)



def _write_desktop_notification(session_id: str, summary: str):
    """Write a notification event file for Electron to poll."""
    note = {
        "session_id": session_id,
        "summary": summary[:200],
        "timestamp": time.time(),
    }
    path = NOTIFICATION_DIR / f"{uuid.uuid4().hex}.json"
    try:
        path.write_text(json.dumps(note))
    except Exception:
        pass


# ─── APNs Push Notifications ───

# APNs key file: ~/.hermes/apns_key.p8
_APNS_KEY_FILE = hermes_home / "apns_key.p8"
_APNS_KEY_ID = os.environ.get("APNS_KEY_ID", "")
_APNS_TEAM_ID = os.environ.get("APNS_TEAM_ID", "")
_APNS_BUNDLE_ID = "com.airis.app"
_APNS_USE_SANDBOX = os.environ.get("APNS_PRODUCTION", "0") != "1"


def _load_push_tokens() -> list[dict]:
    if PUSH_TOKENS_FILE.exists():
        try:
            return json.loads(PUSH_TOKENS_FILE.read_text())
        except Exception:
            pass
    return []


def _build_apns_jwt() -> str | None:
    """Build a short-lived JWT for APNs authentication."""
    if not _APNS_KEY_FILE.exists() or not _APNS_KEY_ID or not _APNS_TEAM_ID:
        return None
    try:
        import jwt as pyjwt
        key = _APNS_KEY_FILE.read_text()
        payload = {
            "iss": _APNS_TEAM_ID,
            "iat": int(time.time()),
        }
        token = pyjwt.encode(payload, key, algorithm="ES256", headers={"kid": _APNS_KEY_ID})
        return token
    except ImportError:
        print("[iris-bridge] PyJWT not installed — push notifications disabled. pip install PyJWT")
        return None
    except Exception as e:
        print(f"[iris-bridge] Failed to build APNs JWT: {e}")
        return None


def _send_push_notification(title: str, body: str, session_id: str = ""):
    """Send APNs push to all registered iOS tokens (only when no foreground clients)."""
    print(f"[iris-bridge] Push check: {len(foreground_clients)} foreground clients")
    if foreground_clients:
        print(f"[iris-bridge] Skipping push — {len(foreground_clients)} foreground clients")
        return

    tokens = _load_push_tokens()
    if not tokens:
        print("[iris-bridge] No push tokens registered")
        return

    jwt_token = _build_apns_jwt()
    if not jwt_token:
        print("[iris-bridge] Failed to build APNs JWT")
        return

    print(f"[iris-bridge] Sending push to {len(tokens)} device(s)")

    import httpx
    host = "api.sandbox.push.apple.com" if _APNS_USE_SANDBOX else "api.push.apple.com"

    payload = {
        "aps": {
            "alert": {"title": title, "body": body[:200]},
            "sound": "default",
            "badge": 1,
        },
        "session_id": session_id,
    }

    for entry in tokens:
        device_token = entry.get("token", "")
        if not device_token:
            continue
        try:
            with httpx.Client(http2=True) as client:
                resp = client.post(
                    f"https://{host}/3/device/{device_token}",
                    json=payload,
                    headers={
                        "authorization": f"bearer {jwt_token}",
                        "apns-topic": _APNS_BUNDLE_ID,
                        "apns-push-type": "alert",
                        "apns-priority": "10",
                    },
                )
                if resp.status_code == 200:
                    print(f"[iris-bridge] Push sent successfully to {device_token[:12]}...")
                else:
                    print(f"[iris-bridge] APNs error ({resp.status_code}): {resp.text}")
        except Exception as e:
            print(f"[iris-bridge] Failed to send push to {device_token[:12]}...: {e}")


# ─── Auth helpers ───

def _check_auth(request: Request) -> bool:
    """Return True if auth passes. Localhost is always trusted."""
    if not IRIS_API_KEY:
        return True
    # Localhost connections are trusted
    client_host = request.client.host if request.client else ""
    if client_host in ("127.0.0.1", "::1", "localhost"):
        return True
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:].strip() == IRIS_API_KEY
    return False


def _check_ws_auth(data: dict) -> bool:
    """Check auth from first WS message if required."""
    if not IRIS_API_KEY:
        return True
    token = data.get("api_key", "") or data.get("token", "")
    return token == IRIS_API_KEY


# ─── Agent runner ───

def run_agent_sync(session_id: str, message: str, images: list = None, attachments: list = None):
    """Run agent.run_conversation in an isolated profile worker."""
    try:
        print(f"[iris-bridge] run_agent_sync: session={session_id}, msg={str(message)[:50]}", flush=True)
        cfg = adapter.reload_config()
        profile = resolve_profile_for_session(session_id)
        runtime = get_runtime_manager().ensure(profile)

        # Auto-create session in DB if needed
        try:
            existing = session_db.get_session_title(session_id)
            if existing is None:
                session_db.create_session(session_id=session_id, source="iris", model=cfg["model"])
        except Exception:
            pass

        cancel_flags[session_id] = False
        emit("response.started", {"session_id": session_id, "agentId": profile})

        # Inject project context if session is part of a project
        effective_message = message
        try:
            from projects import find_project_for_session, get_project_context
            project = find_project_for_session(session_id)
            if project:
                ctx = get_project_context(project["id"])
                if ctx:
                    effective_message = f"[Project: {project['name']}]\n{ctx}\n\n{message}"
        except Exception:
            pass

        result = runtime.run(
            session_id=session_id,
            message=effective_message,
            history=sessions.get(session_id, {}).get("history", []),
            emit=emit,
            images=images,
            attachments=attachments,
        )

        # Check if cancelled
        if cancel_flags.get(session_id):
            emit("response.cancelled", {"session_id": session_id})
            cancel_flags.pop(session_id, None)
            running_threads.pop(session_id, None)
            return

        session = sessions.setdefault(session_id, {"history": [], "profile": profile})
        if result and "messages" in result:
            session["history"] = result["messages"]

        final_response = result.get("final_response", "") if result else ""
        if not final_response:
            streamed = "".join(_session_stream_buffers.get(session_id, []))
            if streamed:
                final_response = streamed.strip()
        _session_stream_buffers.pop(session_id, None)

        if final_response:
            final_response = _process_media_refs(final_response, session_id)

        _save_activities(session_id)

        _add_to_roster(session_id, profile)

        emit("response.completed", {
            "session_id": session_id,
            "final_response": final_response,
            "api_calls": result.get("api_calls", 0) if result else 0,
            "agentId": profile,
        })

        # Agent-to-agent delegation: if response @mentions another agent, enqueue
        if final_response:
            mentioned_agents, _ = _extract_agent_mentions(final_response)
            for target_agent in mentioned_agents:
                if target_agent != profile:
                    _add_to_roster(session_id, target_agent)
                    followup = AgentJob(
                        job_id=_next_job_id(),
                        profile=target_agent,
                        session_id=session_id,
                        message=f"[{profile} delegated to you]: {final_response}",
                        kind="dm",
                    )
                    q = agent_queues.get(target_agent)
                    if q:
                        q.put(followup)
                        emit("queue.job_queued", {
                            "profile": target_agent,
                            "job_id": followup.job_id,
                            "session_id": session_id,
                            "position": q.qsize(),
                            "delegated_from": profile,
                        })

        if not clients and final_response:
            _write_desktop_notification(session_id, final_response[:200])

        if final_response:
            preview = final_response[:200].replace("\n", " ").strip()
            _send_push_notification("Hermes", preview, session_id)

        running_threads.pop(session_id, None)

    except Exception as e:
        error_msg = str(e)
        lower = error_msg.lower()
        if "rate_limit" in lower or "rate limit" in lower or "429" in lower:
            error_msg = "Rate limit exceeded. Please wait a moment and try again."
        elif "401" in lower or "unauthorized" in lower or "authentication" in lower:
            error_msg = "Authentication failed. Check your API key in settings."
        elif "timeout" in lower:
            error_msg = "Request timed out. The API may be experiencing issues."
        elif "connection" in lower:
            error_msg = "Connection error. Check your network and API endpoint."

        emit("response.error", {
            "session_id": session_id,
            "error": error_msg,
            "agentId": resolve_profile_for_session(session_id),
        })
        running_threads.pop(session_id, None)


# ─── FastAPI app ───

app = FastAPI(title="Iris Bridge", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── HTTP Endpoints ───

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "uptime": round(time.time() - _start_time, 1),
        "connected_clients": len(clients),
    }


@app.post("/internal/restart-profile")
async def internal_restart_profile(request: Request):
    payload = await request.json()
    profile = str(payload.get("profile", "")).strip()
    if profile not in PROFILE_NAMES:
        return JSONResponse(status_code=400, content={"status": "error", "error": f"unknown profile: {profile}"})
    runtime = get_runtime_manager().restart(profile)
    return {
        "status": "ok",
        "profile": profile,
        "pid": runtime.process.pid if runtime.process else None,
        "restart_count": runtime.restart_count,
    }


@app.post("/auth")
async def auth(request: Request):
    if _check_auth(request):
        return {"status": "ok", "authenticated": True}
    return JSONResponse(status_code=401, content={"status": "error", "authenticated": False})


_MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50MB
_ALLOWED_UPLOAD_TYPES = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".pdf", ".txt", ".md", ".csv", ".json", ".py", ".js", ".ts"}

@app.post("/upload")
async def upload(request: Request, file: UploadFile = File(...)):
    if not _check_auth(request):
        return JSONResponse(status_code=401, content={"error": "unauthorized"})

    ext = Path(file.filename).suffix.lower() if file.filename else ""
    if ext and ext not in _ALLOWED_UPLOAD_TYPES:
        return JSONResponse(status_code=400, content={"error": f"File type {ext} not allowed"})

    # Stream to disk with size check
    name = f"{uuid.uuid4().hex}{ext}"
    dest = MEDIA_DIR / name
    size = 0
    with open(dest, "wb") as f:
        while chunk := await file.read(8192):
            size += len(chunk)
            if size > _MAX_UPLOAD_SIZE:
                dest.unlink(missing_ok=True)
                return JSONResponse(status_code=413, content={"error": "File too large (50MB max)"})
            f.write(chunk)

    return {"status": "ok", "filename": name, "path": str(dest), "size": size, "url": f"/media/{name}"}


@app.post("/push/register")
async def push_register(request: Request):
    if not _check_auth(request):
        return JSONResponse(status_code=401, content={"error": "unauthorized"})

    body = await request.json()
    token = body.get("token", "")
    platform = body.get("platform", "unknown")

    if not token:
        return JSONResponse(status_code=400, content={"error": "token required"})

    # Load existing tokens
    tokens = []
    if PUSH_TOKENS_FILE.exists():
        try:
            tokens = json.loads(PUSH_TOKENS_FILE.read_text())
        except Exception:
            tokens = []

    # Avoid duplicates
    existing = {t["token"] for t in tokens}
    if token not in existing:
        tokens.append({
            "token": token,
            "platform": platform,
            "registered_at": time.time(),
        })
        PUSH_TOKENS_FILE.write_text(json.dumps(tokens, indent=2))

    return {"status": "ok", "total_tokens": len(tokens)}


@app.get("/sessions")
async def http_list_sessions(request: Request):
    if not _check_auth(request):
        return JSONResponse(status_code=401, content={"error": "unauthorized"})

    sessions_list = session_db.list_sessions_rich(source=None, limit=50)
    return {
        "sessions": [{
            "id": s["id"],
            "title": s.get("title") or s.get("preview", "Untitled"),
            "started_at": s.get("started_at", 0),
            "last_active": s.get("last_active", 0),
            "message_count": s.get("message_count", 0),
            "preview": s.get("preview", ""),
        } for s in sessions_list],
    }


@app.get("/sessions/{session_id}")
async def http_get_session(session_id: str, request: Request):
    if not _check_auth(request):
        return JSONResponse(status_code=401, content={"error": "unauthorized"})

    history = session_db.get_messages_as_conversation(session_id)
    formatted = []
    for m in history:
        role = m.get("role", "")
        content = m.get("content", "")
        if role not in ("user", "assistant", "divider"):
            continue
        if not content or not content.strip():
            continue
        formatted.append({"role": role, "content": content})

    activities = _load_activities(session_id)
    title = session_db.get_session_title(session_id) or ""

    return {
        "session_id": session_id,
        "title": title,
        "messages": formatted,
        "activities": activities,
    }


# ─── Permissions endpoints ───

@app.get("/permissions")
async def http_get_permissions(request: Request):
    if not _check_auth(request):
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    return {"permissions": load_permissions()}


@app.post("/permissions")
async def http_set_permissions(request: Request):
    if not _check_auth(request):
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    body = await request.json()
    perms = load_permissions()
    for key, value in body.items():
        if key in perms and value in ("allowed", "ask", "denied"):
            perms[key] = value
    save_permissions(perms)
    return {"permissions": perms}


# ─── Proactive messaging (Hermes → User) ───

@app.post("/hermes/message")
async def hermes_proactive_message(request: Request):
    """Allow Hermes (autonomy daemon, cron jobs, etc.) to send a message to Iris.
    Creates a new session or appends to an existing one, broadcasts to all clients."""
    if not _check_auth(request):
        return JSONResponse(status_code=401, content={"error": "unauthorized"})

    body = await request.json()
    text = body.get("text", "").strip()
    session_id = body.get("session_id")
    title = body.get("title", "Hermes")
    push = body.get("push", True)  # send push notification by default

    if not text:
        return JSONResponse(status_code=400, content={"error": "text required"})

    # Default to Home session if none specified
    if not session_id:
        session_id = HOME_SESSION_ID

    # Persist the message
    try:
        session_db.append_message(session_id, "assistant", content=text)
    except Exception as e:
        print(f"[iris-bridge] Failed to persist proactive message: {e}")

    # Broadcast to all connected clients
    emit("hermes.message", {
        "session_id": session_id,
        "text": text,
        "title": title,
        "timestamp": time.time(),
    })

    # Push notification if requested
    if push:
        preview = text[:200].replace("\n", " ").strip()
        _send_push_notification(title, preview, session_id)
        _write_desktop_notification(session_id, preview)

    return {
        "status": "ok",
        "session_id": session_id,
        "delivered_to": len(clients),
        "push_sent": push,
    }


@app.post("/hermes/nudge")
async def hermes_nudge(request: Request):
    """Lightweight ping — just a push/desktop notification, no session created."""
    if not _check_auth(request):
        return JSONResponse(status_code=401, content={"error": "unauthorized"})

    body = await request.json()
    title = body.get("title", "Hermes")
    text = body.get("text", "").strip()
    if not text:
        return JSONResponse(status_code=400, content={"error": "text required"})

    _send_push_notification(title, text[:200])
    _write_desktop_notification("", text[:200])

    # Also broadcast a lightweight event to connected clients
    emit("hermes.nudge", {
        "title": title,
        "text": text,
        "timestamp": time.time(),
    })

    return {"status": "ok", "delivered_to": len(clients)}


# ─── Home session convenience endpoint ───

@app.post("/hermes/home")
async def hermes_home_message(request: Request):
    """Post a message to the persistent Home session."""
    if not _check_auth(request):
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    body = await request.json()
    text = body.get("text", "").strip()
    if not text:
        return JSONResponse(status_code=400, content={"error": "text required"})
    push = body.get("push", True)

    try:
        session_db.append_message(HOME_SESSION_ID, "assistant", content=text)
    except Exception as e:
        print(f"[iris-bridge] Failed to persist home message: {e}")

    emit("hermes.message", {
        "session_id": HOME_SESSION_ID,
        "text": text,
        "title": "Home",
        "timestamp": time.time(),
    })

    if push:
        preview = text[:200].replace("\n", " ").strip()
        _send_push_notification("Hermes", preview, HOME_SESSION_ID)
        _write_desktop_notification(HOME_SESSION_ID, preview)

    return {
        "status": "ok",
        "session_id": HOME_SESSION_ID,
        "delivered_to": len(clients),
        "push_sent": push,
    }


# ─── Media file serving ───

@app.get("/media/{filename}")
async def serve_media(filename: str):
    filepath = MEDIA_DIR / filename
    if not filepath.exists():
        return JSONResponse(status_code=404, content={"error": "not found"})
    return FileResponse(filepath)


# ─── WebSocket handler ───

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    # Auth: localhost connections are trusted, remote connections need API key
    client_host = websocket.client.host if websocket.client else ""
    is_localhost = client_host in ("127.0.0.1", "::1", "localhost")
    authed = not IRIS_API_KEY or is_localhost

    clients.add(websocket)
    print(f"[iris-bridge] Client connected ({len(clients)} total)")

    try:
        # If auth required, wait for credentials before sending any metadata
        if not authed:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "auth.failed", "error": "Invalid message"})
                return
            if _check_ws_auth(msg):
                authed = True
            else:
                await websocket.send_json({"type": "auth.failed", "error": "Invalid API key"})
                return

        # Only send metadata after auth passes
        cfg = _get_model_info()
        await websocket.send_json({
            "type": "connection.ready",
            "model": cfg["model"],
            "provider": cfg["provider"],
            "agent_name": get_agent_name(),
            "sessions": list(sessions.keys()),
            "running_sessions": list(running_threads.keys()),
        })

        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            action = msg.get("action")
            if not action:
                continue

            # ─── send_message ───
            if action == "send_message":
                # Target-first routing: "dm:talos" or "channel:general"
                target = msg.get("target")
                if target:
                    kind, _, tid = target.partition(":")
                    session_id = "home" if (kind == "dm" and tid == "hermes") else tid
                else:
                    kind = "channel"
                    tid = msg.get("session_id", "default")
                    session_id = tid
                text = msg.get("text", "").strip()
                if not text:
                    continue

                images = msg.get("images")  # [{data: "base64...", mime: "image/png"}]
                attachments = msg.get("attachments")

                if kind == "channel":
                    # Public channel transcript + mention-triggered multi-agent posts
                    _ensure_public_channel_session(session_id)
                    _append_channel_message(session_id, "user", text)
                    try:
                        session_db.append_message(session_id, "user", content=text)
                    except Exception:
                        pass
                    emit("message.user", {
                        "session_id": session_id,
                        "text": text,
                    })
                    mentioned_agents, stripped_prompt = _extract_agent_mentions(text)
                    target_agents = mentioned_agents or _channel_agent_ids(session_id)
                    for agent_id in target_agents:
                        job = AgentJob(
                            job_id=_next_job_id(),
                            profile=agent_id,
                            session_id=session_id,
                            message=stripped_prompt,
                            kind="channel",
                            channel_id=session_id,
                        )
                        q = agent_queues.get(agent_id)
                        if q:
                            q.put(job)
                            emit("queue.job_queued", {
                                "profile": agent_id,
                                "job_id": job.job_id,
                                "session_id": session_id,
                                "position": q.qsize(),
                            })
                        else:
                            # Fallback: unknown profile, run directly
                            threading.Thread(target=_run_channel_agent, args=(session_id, stripped_prompt, agent_id), daemon=True).start()
                else:
                    emit("message.user", {
                        "session_id": session_id,
                        "text": text,
                    })
                    profile = resolve_profile_for_session(session_id)
                    job = AgentJob(
                        job_id=_next_job_id(),
                        profile=profile,
                        session_id=session_id,
                        message=text,
                        kind="dm",
                        images=images,
                        attachments=attachments,
                    )
                    q = agent_queues.get(profile)
                    if q:
                        q.put(job)
                        emit("queue.job_queued", {
                            "profile": profile,
                            "job_id": job.job_id,
                            "session_id": session_id,
                            "position": q.qsize(),
                        })
                    else:
                        threading.Thread(target=run_agent_sync, args=(session_id, text, images, attachments), daemon=True).start()

            # ─── agent_post: an agent speaks in a channel as itself ───
            elif action == "agent_post":
                agent_id = msg.get("agent_id", "")  # e.g. "talos"
                channel_id = msg.get("channel_id", "general")
                text = msg.get("text", "").strip()
                if not agent_id or not text:
                    continue

                def run_agent_post(aid: str, cid: str, prompt: str):
                    """Run agent and post result to channel."""
                    try:
                        profile = aid if aid in ("hermes", "talos", "icarus", "charon", "nyx") else "hermes"
                        post_agent = adapter.create_agent(
                            f"{cid}-{aid}", {"emit": lambda *a, **k: None}, session_db, profile=profile
                        )
                        result = adapter.run_conversation(post_agent, prompt, [])
                        response = result.get("final_response", "") if result else ""
                        if response:
                            post_event = {
                                "type": "hermes.message",
                                "session_id": cid,
                                "text": response,
                                "agentId": aid,
                                "timestamp": time.time(),
                            }
                            emit("hermes.message", post_event)
                            try:
                                session_db.append_message(cid, "assistant", content=response)
                            except Exception:
                                pass
                    except Exception as e:
                        print(f"[iris-bridge] agent_post error: {e}", flush=True)

                thread = threading.Thread(
                    target=run_agent_post,
                    args=(agent_id, channel_id, text),
                    daemon=True,
                )
                thread.start()

            # ─── cancel_response ───
            elif action == "cancel_response":
                session_id = msg.get("session_id", "default")
                if session_id in running_threads:
                    cancel_flags[session_id] = True
                    emit("response.cancelled", {"session_id": session_id})
                    emit("response.completed", {
                        "session_id": session_id,
                        "final_response": "[Interrupted]",
                        "api_calls": 0,
                    })
                    running_threads.pop(session_id, None)

            # ─── insert_divider ───
            elif action == "insert_divider":
                session_id = msg.get("session_id", HOME_SESSION_ID)
                text = msg.get("text", "--- Session Boundary ---")
                try:
                    session_db.append_message(session_id, "divider", content=text)
                    emit("session.divider_inserted", {
                        "session_id": session_id,
                        "text": text
                    })
                except Exception as e:
                    print(f"[iris-bridge] Failed to insert divider: {e}")

            # ─── new_session ───
            elif action == "new_session":
                cfg = _get_model_info()
                sid = make_session_id()
                session_db.create_session(session_id=sid, source="iris", model=cfg["model"])
                sessions[sid] = {
                    "profile": resolve_profile_for_session(sid),
                    "history": [],
                }
                emit("session.created", {"session_id": sid})

            # ─── list_sessions ───
            elif action == "list_sessions":
                sessions_list = session_db.list_sessions_rich(source=None, limit=50)
                await websocket.send_json({
                    "type": "sessions.list",
                    "sessions": [{
                        "id": s["id"],
                        "title": s.get("title") or s.get("preview", "Untitled"),
                        "started_at": s.get("started_at", 0),
                        "last_active": s.get("last_active", 0),
                        "message_count": s.get("message_count", 0),
                        "preview": s.get("preview", ""),
                    } for s in sessions_list],
                })

            # ─── resume_session ───
            elif action == "resume_session":
                sid = msg.get("session_id", "")
                print(f"[iris-bridge] resume_session: {sid}", flush=True)
                if not sid:
                    continue
                msg_limit = msg.get("limit", 50)  # Only load last N messages
                channel_messages = _load_channel_messages(sid)
                if channel_messages:
                    full_history = [
                        {
                            "role": m.get("role", "assistant"),
                            "content": m.get("content", ""),
                            "timestamp": m.get("timestamp", 0),
                            "agentId": m.get("agentId"),
                        }
                        for m in channel_messages
                    ]
                else:
                    history = session_db.get_messages_as_conversation(sid)
                    full_history = list(history)
                if sid in sessions:
                    sessions[sid]["history"] = full_history
                else:
                    profile = resolve_profile_for_session(sid)
                    sessions[sid] = {
                        "profile": profile,
                        "history": full_history,
                    }
                # Only send last N messages to client (paginated)
                recent_history = full_history[-msg_limit:] if len(full_history) > msg_limit else full_history
                # Deduplicate consecutive messages with same role+content
                formatted = []
                for m in recent_history:
                    role = m.get("role", "")
                    content = m.get("content", "")
                    if role not in ("user", "assistant", "divider"):
                        continue
                    if not content or not content.strip():
                        continue
                    # Skip if identical to the previous message
                    if formatted and formatted[-1]["role"] == role and formatted[-1]["content"] == content:
                        continue
                    formatted.append({
                        "role": role,
                        "content": content,
                        "timestamp": m.get("timestamp", ""),
                        "agentId": m.get("agentId"),
                    })
                saved_activities = _load_activities(sid)
                session_activities[sid] = saved_activities
                await websocket.send_json({
                    "type": "session.resumed",
                    "session_id": sid,
                    "messages": formatted,
                    "activities": saved_activities,
                    "title": session_db.get_session_title(sid) or "",
                    "running_sessions": list(running_threads.keys()),
                })

            # ─── delete_session ───
            elif action == "delete_session":
                sid = msg.get("session_id", "")
                if sid == HOME_SESSION_ID:
                    pass  # Can't delete home session
                elif sid:
                    session_db.delete_session(sid)
                    if sid in sessions:
                        del sessions[sid]
                    emit("session.deleted", {"session_id": sid})
                    sessions_list = session_db.list_sessions_rich(source=None, limit=50)
                    await websocket.send_json({
                        "type": "sessions.list",
                        "sessions": [{
                            "id": s["id"],
                            "title": s.get("title") or s.get("preview", "Untitled"),
                            "started_at": s.get("started_at", 0),
                            "last_active": s.get("last_active", 0),
                            "message_count": s.get("message_count", 0),
                            "preview": s.get("preview", ""),
                        } for s in sessions_list],
                    })

            # ─── get_memory ───
            elif action == "get_memory":
                memory, user = get_memory()
                await websocket.send_json({
                    "type": "memory.state",
                    "memory": memory,
                    "user": user,
                })

            # ─── get_agents (live Pantheon state) ───
            elif action == "get_agents":
                from hermes_adapter import get_profile_home, get_config as _get_cfg, get_agent_name as _get_name
                runtime_manager = get_runtime_manager()
                statuses = {s.profile: s for s in runtime_manager.statuses()}
                agents_out = []
                for agent_id in ["hermes", "talos", "icarus", "charon", "nyx"]:
                    home = get_profile_home(agent_id)
                    # Config
                    cfg = _get_cfg(home)
                    m = cfg.get("model", {})
                    model = m.get("default", "") if isinstance(m, dict) else str(m)
                    provider = m.get("provider", "") if isinstance(m, dict) else ""
                    # Name from SOUL
                    name = _get_name(home)
                    # Status
                    runtime = statuses.get(agent_id)
                    is_running = bool(runtime and runtime.alive)
                    # Memory count
                    mem_file = home / "memories" / "MEMORY.md"
                    mem_count = 0
                    if mem_file.exists():
                        mem_count = sum(1 for line in mem_file.read_text().splitlines() if line.strip().startswith("- "))
                    # Skill count
                    skills_dir = home / "skills"
                    skill_count = 0
                    if skills_dir.exists():
                        for cat in skills_dir.iterdir():
                            if cat.is_dir():
                                for sk in cat.iterdir():
                                    if sk.is_dir() and (sk / "SKILL.md").exists():
                                        skill_count += 1
                    # Session info
                    sid = HOME_SESSION_ID if agent_id == "hermes" else agent_id
                    msg_count = 0
                    last_active = 0
                    try:
                        msgs = session_db.get_messages_as_conversation(sid)
                        msg_count = len(list(msgs))
                        # Get last_active from sessions list
                        all_sessions = session_db.list_sessions()
                        for s in all_sessions:
                            if s.get("id") == sid or s.get("session_id") == sid:
                                last_active = s.get("last_active", 0)
                                break
                    except Exception:
                        pass
                    agents_out.append({
                        "id": agent_id,
                        "name": name,
                        "model": model,
                        "provider": provider,
                        "status": "running" if is_running else "idle",
                        "memorySize": mem_count,
                        "skillCount": skill_count,
                        "messageCount": msg_count,
                        "lastActive": last_active,
                        "restartCount": runtime.restart_count if runtime else 0,
                        "lastError": runtime.last_error if runtime else None,
                        "mode": "daemon" if agent_id == "nyx" else "agent",
                    })
                await websocket.send_json({"type": "agents.list", "agents": agents_out})

            # ─── get_config ───
            elif action == "get_config":
                cfg = _get_model_info()
                fresh_config = get_config()
                await websocket.send_json({
                    "type": "config.state",
                    "model": cfg["model"],
                    "provider": cfg["provider"],
                    "agent_name": get_agent_name(),
                    "base_url": cfg["base_url"] or "",
                    "config": fresh_config,
                })

            # ─── Channels ───
            elif action == "list_channels":
                await websocket.send_json({"type": "channels.list", "channels": _list_channels()})

            elif action == "create_channel":
                cid = msg.get("channel_id", "").strip().lower().replace(" ", "-")
                if not cid:
                    cid = f"ch-{uuid.uuid4().hex[:6]}"
                name = msg.get("name", cid)
                project_id = msg.get("project_id", "")
                agent_ids = msg.get("agent_ids") or []
                ch = _create_channel(cid, name, project_id, agent_ids)
                emit("channel.created", ch)
                # Also link to project if specified
                if project_id:
                    try:
                        from projects import link_session
                        link_session(project_id, cid)
                    except Exception:
                        pass

            elif action == "archive_channel":
                cid = msg.get("channel_id", "")
                if _archive_channel(cid):
                    emit("channel.archived", {"channel_id": cid})

            elif action == "unarchive_channel":
                cid = msg.get("channel_id", "")
                if _unarchive_channel(cid):
                    emit("channel.unarchived", {"channel_id": cid})

            # ─── Projects ───
            elif action == "list_projects":
                from projects import list_projects as _lp
                await websocket.send_json({"type": "projects.list", "projects": _lp()})

            elif action == "create_project":
                from projects import create_project as _cp
                p = _cp(
                    name=msg.get("name", "Untitled"),
                    description=msg.get("description", ""),
                    agents=msg.get("agents"),
                )
                emit("project.created", p)
                await websocket.send_json({"type": "projects.list", "projects": __import__("projects").list_projects()})

            elif action == "update_project":
                from projects import update_project as _up
                p = _up(msg.get("project_id", ""), **{k: v for k, v in msg.items() if k not in ("action", "project_id")})
                if p:
                    emit("project.updated", p)

            elif action == "delete_project":
                from projects import delete_project as _dp
                _dp(msg.get("project_id", ""))
                emit("project.deleted", {"project_id": msg.get("project_id", "")})

            elif action == "link_session_to_project":
                from projects import link_session as _ls
                p = _ls(msg.get("project_id", ""), msg.get("session_id", ""))
                if p:
                    emit("project.updated", p)

            elif action == "unlink_session_from_project":
                from projects import unlink_session as _us
                p = _us(msg.get("project_id", ""), msg.get("session_id", ""))
                if p:
                    emit("project.updated", p)

            elif action == "get_project_memory":
                from projects import get_project_memory as _gpm
                mem = _gpm(msg.get("project_id", ""))
                await websocket.send_json({"type": "project.memory", "project_id": msg.get("project_id", ""), "memory": mem})

            # ─── get_queue_status ───
            elif action == "get_queue_status":
                _broadcast_queue_status()

            # ─── get_health ───
            elif action == "get_health":
                health = get_runtime_manager().health_check_all()
                await websocket.send_json({
                    "type": "health.state",
                    "agents": health,
                })

            # ─── restart_agent ───
            elif action == "restart_agent":
                profile = msg.get("profile", "")
                if profile in ("hermes", "talos", "icarus", "charon", "nyx"):
                    get_runtime_manager().restart_profile(profile)
                    emit("agent.restarted", {"profile": profile})

            # ─── get_session_roster ───
            elif action == "get_session_roster":
                sid = msg.get("session_id", "")
                await websocket.send_json({
                    "type": "session.roster",
                    "session_id": sid,
                    "agents": _get_roster(sid),
                })

            # ─── set_config ───
            elif action == "set_config":
                key = msg.get("key", "")
                value = msg.get("value")
                if key and value is not None:
                    try:
                        set_config_value(key, value)
                        # Clear cached agents so they pick up new config
                        if key.startswith("model."):
                            get_runtime_manager().clear_all_caches()
                        emit("config.updated", {"key": key, "value": value})
                    except Exception as e:
                        await websocket.send_json({
                            "type": "config.error",
                            "error": str(e),
                        })

            # ─── list_providers ───
            elif action == "list_providers":
                from hermes_adapter import list_providers
                providers = list_providers()
                await websocket.send_json({
                    "type": "providers.list",
                    "providers": providers,
                })

            # ─── get_skills ───
            elif action == "get_skills":
                skills = list_skills()
                config = get_config()
                disabled = config.get("skills", {}).get("disabled", [])
                for s in skills:
                    s["enabled"] = s["name"] not in disabled
                await websocket.send_json({
                    "type": "skills.list",
                    "skills": skills,
                    "total": len(skills),
                })

            # ─── get_toolsets ───
            elif action == "get_toolsets":
                try:
                    toolsets = get_available_toolsets()
                    await websocket.send_json({
                        "type": "toolsets.list",
                        "toolsets": toolsets,
                        "total": len(toolsets),
                    })
                except Exception as e:
                    await websocket.send_json({
                        "type": "toolsets.error",
                        "error": str(e),
                    })

            # ─── list_jobs ───
            elif action == "list_jobs":
                try:
                    jobs = list_jobs(include_disabled=True)
                    await websocket.send_json({
                        "type": "jobs.list",
                        "jobs": jobs,
                    })
                except Exception as e:
                    await websocket.send_json({
                        "type": "jobs.list",
                        "jobs": [],
                        "error": str(e),
                    })

            # ─── create_job ───
            elif action == "create_job":
                try:
                    job = create_job(
                        prompt=msg.get("prompt", ""),
                        schedule=msg.get("schedule", ""),
                        name=msg.get("name"),
                        repeat=msg.get("repeat"),
                        deliver=msg.get("deliver", "local"),
                    )
                    emit("job.created", {"job": job})
                    jobs = list_jobs(include_disabled=True)
                    await websocket.send_json({
                        "type": "jobs.list",
                        "jobs": jobs,
                    })
                except Exception as e:
                    await websocket.send_json({
                        "type": "job.error",
                        "error": str(e),
                    })

            # ─── pause_job ───
            elif action == "pause_job":
                try:
                    job = pause_job(msg.get("job_id", ""), reason=msg.get("reason", "Paused from Iris"))
                    emit("job.updated", {"job": job})
                    jobs = list_jobs(include_disabled=True)
                    await websocket.send_json({
                        "type": "jobs.list",
                        "jobs": jobs,
                    })
                except Exception as e:
                    await websocket.send_json({
                        "type": "job.error",
                        "error": str(e),
                    })

            # ─── resume_job ───
            elif action == "resume_job":
                try:
                    job = resume_job(msg.get("job_id", ""))
                    emit("job.updated", {"job": job})
                    jobs = list_jobs(include_disabled=True)
                    await websocket.send_json({
                        "type": "jobs.list",
                        "jobs": jobs,
                    })
                except Exception as e:
                    await websocket.send_json({
                        "type": "job.error",
                        "error": str(e),
                    })

            # ─── trigger_job ───
            elif action == "trigger_job":
                try:
                    job = trigger_job(msg.get("job_id", ""))
                    emit("job.triggered", {"job": job})
                    jobs = list_jobs(include_disabled=True)
                    await websocket.send_json({
                        "type": "jobs.list",
                        "jobs": jobs,
                    })
                except Exception as e:
                    await websocket.send_json({
                        "type": "job.error",
                        "error": str(e),
                    })

            # ─── remove_job ───
            elif action == "remove_job":
                try:
                    remove_job(msg.get("job_id", ""))
                    emit("job.removed", {"job_id": msg.get("job_id", "")})
                    jobs = list_jobs(include_disabled=True)
                    await websocket.send_json({
                        "type": "jobs.list",
                        "jobs": jobs,
                    })
                except Exception as e:
                    await websocket.send_json({
                        "type": "job.error",
                        "error": str(e),
                    })

            # ─── get_job_output ───
            elif action == "get_job_output":
                job_id = msg.get("job_id", "")
                outputs = get_job_outputs(job_id)
                await websocket.send_json({
                    "type": "job.output",
                    "job_id": job_id,
                    "outputs": outputs,
                })

            # ─── get_soul ───
            elif action == "get_soul":
                await websocket.send_json({
                    "type": "soul.state",
                    "content": get_soul_content(),
                    "agent_name": get_agent_name(),
                })

            # ─── get_permissions ───
            elif action == "get_permissions":
                await websocket.send_json({
                    "type": "permissions.state",
                    "permissions": load_permissions(),
                })

            # ─── set_permissions ───
            elif action == "set_permissions":
                category = msg.get("category", "")
                value = msg.get("value", "")
                if category and value in ("allowed", "ask", "denied"):
                    perms = load_permissions()
                    if category in perms:
                        perms[category] = value
                        save_permissions(perms)
                    await websocket.send_json({
                        "type": "permissions.state",
                        "permissions": load_permissions(),
                    })

            # ─── app_state (foreground/background tracking for push notifications) ───
            elif action == "debug":
                print(f"[iris-bridge] DEBUG from client: {msg.get('msg', '')}")

            elif action == "app_state":
                state = msg.get("state", "")
                print(f"[iris-bridge] Client app_state: {state}")
                if state == "foreground":
                    foreground_clients.add(websocket)
                elif state == "background":
                    foreground_clients.discard(websocket)

            # ─── register_push_token ───
            elif action == "register_push_token":
                token = msg.get("token", "")
                platform = msg.get("platform", "ios")
                if token:
                    tokens = _load_push_tokens()
                    existing = {t["token"] for t in tokens}
                    if token not in existing:
                        tokens.append({"token": token, "platform": platform, "registered_at": time.time()})
                        PUSH_TOKENS_FILE.write_text(json.dumps(tokens, indent=2))

    except WebSocketDisconnect:
        pass
    except Exception as e:
        import traceback
        print(f"[iris-bridge] WebSocket error: {e}")
        traceback.print_exc()
    finally:
        clients.discard(websocket)
        foreground_clients.discard(websocket)
        print(f"[iris-bridge] Client disconnected ({len(clients)} total)")


# ─── Static file serving (Next.js export) ───
# Serve the built Next.js app so mobile clients can connect without a separate dev server.
# Only mounted if the out/ directory exists (i.e. after `pnpm build`).
_BRIDGE_DIR = Path(__file__).parent
_OUT_DIR = _BRIDGE_DIR.parent / "out"
if _OUT_DIR.exists():
    app.mount("/", StaticFiles(directory=str(_OUT_DIR), html=True), name="static")


class _RestartSocketHandler(socketserver.BaseRequestHandler):
    def handle(self):
        try:
            raw = self.request.recv(4096).decode("utf-8", errors="ignore")
            body = raw.split("\r\n\r\n", 1)[1] if "\r\n\r\n" in raw else "{}"
            payload = json.loads(body or "{}")
            profile = str(payload.get("profile", "")).strip()
            if profile not in PROFILE_NAMES:
                response = b"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n"
                self.request.sendall(response)
                return
            runtime = get_runtime_manager().restart(profile)
            data = json.dumps({"status": "ok", "profile": profile, "pid": runtime.process.pid if runtime.process else None}).encode("utf-8")
            response = b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: " + str(len(data)).encode("utf-8") + b"\r\n\r\n" + data
            self.request.sendall(response)
        except Exception:
            try:
                self.request.sendall(b"HTTP/1.1 500 Internal Server Error\r\nContent-Length: 0\r\n\r\n")
            except Exception:
                pass


class _UnixRestartServer(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True
    allow_reuse_address = True


# ─── Startup ───

_restart_socket_server: Optional[_UnixRestartServer] = None
_restart_socket_thread: Optional[threading.Thread] = None


@app.on_event("startup")
async def startup():
    global _main_loop, _restart_socket_server, _restart_socket_thread
    _main_loop = asyncio.get_running_loop()
    cfg = _get_model_info()
    try:
        if os.path.exists(_RESTART_SOCKET_PATH):
            os.unlink(_RESTART_SOCKET_PATH)
        _restart_socket_server = _UnixRestartServer(_RESTART_SOCKET_PATH, _RestartSocketHandler)
        _restart_socket_thread = threading.Thread(target=_restart_socket_server.serve_forever, daemon=True, name="iris-restart-socket")
        _restart_socket_thread.start()
        os.environ["IRIS_PROFILE_RESTART_SOCKET"] = _RESTART_SOCKET_PATH
    except Exception as e:
        print(f"[iris-bridge] Failed to start restart socket: {e}")

    # Auto-create persistent Home session if it doesn't exist
    try:
        existing = session_db.get_session_title(HOME_SESSION_ID)
        if existing is None:
            session_db.create_session(session_id=HOME_SESSION_ID, source="hermes", model=cfg["model"])
            session_db.set_session_title(HOME_SESSION_ID, "Home")
            print(f"[iris-bridge] Created persistent Home session")
    except Exception as e:
        print(f"[iris-bridge] Failed to create home session: {e}")

    # Initialize agent job queues
    _init_agent_queues()
    print("[iris-bridge] Agent job queues initialized")

    # Start all profile runtimes; Nyx will supervise them via the restart RPC.
    try:
        runtime_manager = get_runtime_manager()
        runtime_manager.start_profiles(list(PROFILE_NAMES))
        print(f"[iris-bridge] Started profile runtimes: {', '.join(PROFILE_NAMES)}")
    except Exception as e:
        print(f"[iris-bridge] Failed to start profile runtimes: {e}")

    print(f"[iris-bridge] Starting on http://0.0.0.0:{PORT}")
    print(f"[iris-bridge] Model: {cfg['model']} via {cfg['provider']}")
    print(f"[iris-bridge] Hermes home: {hermes_home}")
    if _OUT_DIR.exists():
        print(f"[iris-bridge] Serving static app from {_OUT_DIR}")
    else:
        print(f"[iris-bridge] No static build found — run `pnpm build` to enable mobile standalone mode")
    if IRIS_API_KEY:
        print(f"[iris-bridge] Auth enabled (IRIS_API_KEY set)")
    else:
        print(f"[iris-bridge] Auth disabled (dev mode)")


@app.on_event("shutdown")
async def shutdown():
    global _restart_socket_server, _restart_socket_thread
    try:
        if _restart_socket_server:
            _restart_socket_server.shutdown()
            _restart_socket_server.server_close()
    finally:
        _restart_socket_server = None
        _restart_socket_thread = None
        try:
            if os.path.exists(_RESTART_SOCKET_PATH):
                os.unlink(_RESTART_SOCKET_PATH)
        except Exception:
            pass


# ─── Main ───

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=PORT,
        log_level="info",
    )
