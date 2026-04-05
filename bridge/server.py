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
_cancel_lock = threading.Lock()
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
_job_counter_lock = threading.Lock()

def _next_job_id() -> str:
    global _job_counter
    with _job_counter_lock:
        _job_counter += 1
        return f"job-{int(time.time())}-{_job_counter}"

def _broadcast_queue_status():
    """Emit current queue depths to all clients."""
    status = {}
    for profile in PROFILE_NAMES:
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

def _cleanup_stale_state():
    """Periodic cleanup of unbounded dicts. Run from a background thread."""
    MAX_SESSIONS = 50
    MAX_ACTIVITIES = 30
    while True:
        try:
            time.sleep(300)  # Every 5 minutes
            # Trim sessions dict — keep last N by insertion order
            if len(sessions) > MAX_SESSIONS:
                keys = list(sessions.keys())
                for k in keys[:-MAX_SESSIONS]:
                    sessions.pop(k, None)
            # Trim session_activities
            if len(session_activities) > MAX_ACTIVITIES:
                keys = list(session_activities.keys())
                for k in keys[:-MAX_ACTIVITIES]:
                    _save_activities(k)
                    session_activities.pop(k, None)
            # Trim session_roster
            if len(session_roster) > MAX_SESSIONS:
                keys = list(session_roster.keys())
                for k in keys[:-MAX_SESSIONS]:
                    session_roster.pop(k, None)
            # Trim channel_private_histories
            if len(channel_private_histories) > MAX_SESSIONS:
                keys = list(channel_private_histories.keys())
                for k in keys[:-MAX_SESSIONS]:
                    channel_private_histories.pop(k, None)
            # Clean stale stream buffers (older than 10 min)
            stale = [k for k, v in _session_stream_buffers.items() if not v]
            for k in stale:
                _session_stream_buffers.pop(k, None)
        except Exception:
            pass

def _init_agent_queues():
    """Initialize queues and worker threads for all profiles."""
    for profile in PROFILE_NAMES:
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

from channels import ChannelManager, extract_agent_mentions

channel_mgr = ChannelManager(hermes_home / "iris_channels")

# Thin wrappers for backward compatibility within this file
def _create_channel(channel_id, name="", project_id="", agent_ids=None):
    ch = channel_mgr.create(channel_id, name, project_id, agent_ids)
    _ensure_public_channel_session(channel_id)
    return ch
def _archive_channel(channel_id): return channel_mgr.archive(channel_id)
def _unarchive_channel(channel_id): return channel_mgr.unarchive(channel_id)
def _list_channels(): return channel_mgr.list_all()
def _append_channel_message(channel_id, role, content, agent_id=None): channel_mgr.append_message(channel_id, role, content, agent_id)
def _recent_channel_context(channel_id, limit=18): return channel_mgr.recent_context(channel_id, limit)
def _extract_agent_mentions(text): return extract_agent_mentions(text)
def _channel_agent_ids(channel_id): return channel_mgr.get_agent_ids(channel_id)

session_activities: dict[str, list] = {}
channel_private_histories: dict[str, list] = {}

def _ensure_public_channel_session(channel_id: str) -> None:
    try:
        existing = session_db.get_session_title(channel_id)
        if existing is None:
            cfg = _get_model_info()
            session_db.create_session(session_id=channel_id, source="iris", model=cfg["model"])
    except Exception:
        pass


def _run_channel_agent(channel_id: str, prompt_text: str, agent_id: str) -> None:
    """Run an agent in a channel context. Delegates to _run_agent_common."""
    public_context = _recent_channel_context(channel_id)
    private_session_id = f"channel:{channel_id}:{agent_id}"
    channel_prompt = (
        f"You are participating in shared channel #{channel_id}.\n"
        f"Recent public channel transcript:\n{public_context or '[empty]'}\n\n"
        f"Latest addressed message:\n{prompt_text}\n\n"
        f"Reply directly. Do NOT prefix your response with your name or any label — "
        f"the UI already shows who you are. Just respond naturally."
    )

    def channel_emit(event_type: str, data: dict):
        patched = {**data, "session_id": channel_id, "agentId": agent_id}
        emit(event_type, patched)

    _run_agent_common(
        session_id=private_session_id,
        public_session_id=channel_id,
        profile=agent_id,
        message=channel_prompt,
        history=channel_private_histories.get(private_session_id, []),
        emit_fn=channel_emit,
        is_channel=True,
    )


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
    """Run agent in a DM context. Delegates to _run_agent_common."""
    profile = resolve_profile_for_session(session_id)

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

    _run_agent_common(
        session_id=session_id,
        public_session_id=session_id,
        profile=profile,
        message=effective_message,
        history=sessions.get(session_id, {}).get("history", []),
        emit_fn=emit,
        images=images,
        attachments=attachments,
        is_channel=False,
    )


def _run_agent_common(
    session_id: str,
    public_session_id: str,
    profile: str,
    message: str,
    history: list,
    emit_fn,
    images: list = None,
    attachments: list = None,
    is_channel: bool = False,
):
    """Unified agent execution for both DM and channel contexts.

    session_id: the internal session ID (for channels: "channel:general:talos")
    public_session_id: the user-visible session ID (for channels: "general", for DMs: same as session_id)
    """
    try:
        print(f"[iris-bridge] run_agent: profile={profile}, session={public_session_id}, msg={str(message)[:50]}", flush=True)
        cfg = adapter.reload_config()
        runtime = get_runtime_manager().ensure(profile)

        # Auto-create session in DB if needed
        try:
            existing = session_db.get_session_title(public_session_id)
            if existing is None:
                session_db.create_session(session_id=public_session_id, source="iris", model=cfg["model"])
        except Exception:
            pass

        with _cancel_lock:
            cancel_flags[public_session_id] = False
        emit_fn("response.started", {"session_id": public_session_id, "agentId": profile})

        result = runtime.run(
            session_id=session_id,
            message=message,
            history=history,
            emit=emit_fn,
            images=images,
            attachments=attachments,
        )

        # Check if cancelled
        with _cancel_lock:
            cancelled = cancel_flags.pop(public_session_id, False)
        if cancelled:
            emit_fn("response.cancelled", {"session_id": public_session_id})
            return

        # Update history cache
        if is_channel:
            if result and "messages" in result:
                channel_private_histories[session_id] = result["messages"]
        else:
            session = sessions.setdefault(session_id, {"history": [], "profile": profile})
            if result and "messages" in result:
                session["history"] = result["messages"]

        # Extract final response
        final_response = result.get("final_response", "") if result else ""
        if not final_response:
            streamed = "".join(_session_stream_buffers.get(public_session_id, []))
            if streamed:
                final_response = streamed.strip()
        _session_stream_buffers.pop(public_session_id, None)

        if final_response:
            final_response = _process_media_refs(final_response, public_session_id)

        # Channel-specific: persist to transcript
        if is_channel and final_response:
            _append_channel_message(public_session_id, "assistant", final_response, profile)
            try:
                session_db.append_message(public_session_id, "assistant", content=final_response)
            except Exception:
                pass

        _save_activities(public_session_id)
        _add_to_roster(public_session_id, profile)

        emit_fn("response.completed", {
            "session_id": public_session_id,
            "final_response": final_response,
            "api_calls": result.get("api_calls", 0) if result else 0,
            "agentId": profile,
        })

        # Agent-to-agent delegation (skip for council channels — they self-manage turns)
        is_council = public_session_id.startswith("council-")
        if final_response and not is_council:
            mentioned_agents, _ = _extract_agent_mentions(final_response)
            for target_agent in mentioned_agents:
                if target_agent != profile:
                    _add_to_roster(public_session_id, target_agent)
                    followup = AgentJob(
                        job_id=_next_job_id(),
                        profile=target_agent,
                        session_id=public_session_id,
                        message=f"[{profile} {'said' if is_channel else 'delegated to you'}]: {final_response}",
                        kind="channel" if is_channel else "dm",
                        channel_id=public_session_id if is_channel else None,
                    )
                    q = agent_queues.get(target_agent)
                    if q:
                        q.put(followup)
                        emit("queue.job_queued", {
                            "profile": target_agent,
                            "job_id": followup.job_id,
                            "session_id": public_session_id,
                            "position": q.qsize(),
                            "delegated_from": profile,
                        })
                        # Visible delegation indicator for the UI
                        emit("agent.delegated", {
                            "session_id": public_session_id,
                            "from_agent": profile,
                            "to_agent": target_agent,
                            "job_id": followup.job_id,
                        })

        # DM-specific: push notifications
        if not is_channel:
            if not clients and final_response:
                _write_desktop_notification(public_session_id, final_response[:200])
            if final_response:
                preview = final_response[:200].replace("\n", " ").strip()
                _send_push_notification("Hermes", preview, public_session_id)

        running_threads.pop(public_session_id, None)
        with _cancel_lock:
            cancel_flags.pop(public_session_id, None)

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
            "session_id": public_session_id,
            "error": error_msg,
            "agentId": profile,
        })
        # Cleanup stale state
        running_threads.pop(public_session_id, None)
        with _cancel_lock:
            cancel_flags.pop(public_session_id, None)
        _session_stream_buffers.pop(public_session_id, None)


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
        _tmp = PUSH_TOKENS_FILE.with_suffix(".tmp"); _tmp.write_text(json.dumps(tokens, indent=2)); _tmp.replace(PUSH_TOKENS_FILE)

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


# ─── Channel management HTTP API (for agent tool use) ───

@app.post("/channels/create")
async def create_channel_http(request: Request):
    """Create a channel. Agents can call this via terminal tool."""
    body = await request.json()
    channel_id = (body.get("channel_id") or body.get("name", "")).strip().lower().replace(" ", "-")
    if not channel_id:
        channel_id = f"ch-{uuid.uuid4().hex[:6]}"
    name = body.get("name", channel_id)
    project_id = body.get("project_id", "")
    agent_ids = body.get("agent_ids")
    ch = _create_channel(channel_id, name, project_id, agent_ids)
    emit("channel.created", ch)
    if project_id:
        try:
            from projects import link_session
            link_session(project_id, channel_id)
        except Exception:
            pass
    return ch

@app.post("/channels/archive")
async def archive_channel_http(request: Request):
    body = await request.json()
    cid = body.get("channel_id", "")
    if _archive_channel(cid):
        emit("channel.archived", {"channel_id": cid})
        return {"status": "archived", "channel_id": cid}
    return JSONResponse(status_code=404, content={"error": "channel not found"})

@app.post("/evolve")
async def evolve_skill_http(request: Request):
    """Trigger self-evolution for a skill. Uses the configured Hermes LLM."""
    body = await request.json()
    skill_name = body.get("skill", "").strip()
    iterations = min(int(body.get("iterations", 5)), 20)
    eval_source = body.get("eval_source", "synthetic")
    profile = body.get("profile", "hermes")
    dry_run = body.get("dry_run", False)

    if not skill_name:
        return JSONResponse(status_code=400, content={"error": "skill name required"})

    # Get model config from Hermes to use the same LLM
    cfg = adapter.reload_config()
    model_name = cfg.get("model", "gpt-5.4-mini")
    provider = cfg.get("provider", "openai-codex")

    # Map to litellm-compatible model string for DSPy
    if "claude" in model_name:
        short = model_name.rsplit("-", 1)[0] if model_name[-1].isdigit() and len(model_name.split("-")) > 4 else model_name
        dspy_model = f"anthropic/{short}"
    else:
        dspy_model = f"openai/{model_name}"

    def _run_evolution():
        try:
            import sys as _s
            evo_path = str(Path.home() / "hermes-ecosystem" / "hermes-agent-self-evolution")
            if evo_path not in _s.path:
                _s.path.insert(0, evo_path)
            from evolution.skills.evolve_skill import evolve

            # Point at the correct profile's skills
            from hermes_adapter import get_profile_home
            profile_home = get_profile_home(profile)
            hermes_repo = str(HERMES_DIR)

            evolve(
                skill_name=skill_name,
                iterations=iterations,
                eval_source=eval_source,
                optimizer_model=dspy_model,
                eval_model=dspy_model,
                hermes_repo=hermes_repo,
                dry_run=dry_run,
            )

            emit("evolution.completed", {
                "skill": skill_name,
                "profile": profile,
                "iterations": iterations,
                "model": dspy_model,
            })
        except Exception as e:
            print(f"[iris-bridge] Evolution error: {e}", flush=True)
            emit("evolution.error", {"skill": skill_name, "error": str(e)})

    # Run in background thread
    threading.Thread(target=_run_evolution, daemon=True, name=f"evolve-{skill_name}").start()

    return {"status": "started", "skill": skill_name, "iterations": iterations, "model": dspy_model, "dry_run": dry_run}

@app.post("/tts")
async def text_to_speech(request: Request):
    """Convert text to speech using edge-tts. Returns audio file URL."""
    body = await request.json()
    text = body.get("text", "").strip()
    voice = body.get("voice", "en-US-AriaNeural")
    if not text:
        return JSONResponse(status_code=400, content={"error": "text required"})
    try:
        import edge_tts
        filename = f"tts-{uuid.uuid4().hex[:8]}.mp3"
        filepath = MEDIA_DIR / filename
        communicate = edge_tts.Communicate(text[:2000], voice)
        await communicate.save(str(filepath))
        return {"status": "ok", "url": f"/media/{filename}", "text": text[:100]}
    except ImportError:
        return JSONResponse(status_code=501, content={"error": "edge-tts not installed"})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/generate-image")
async def generate_image(request: Request):
    """Generate an image using fal.ai and return the URL."""
    body = await request.json()
    prompt = body.get("prompt", "").strip()
    if not prompt:
        return JSONResponse(status_code=400, content={"error": "prompt required"})
    try:
        import fal_client
        result = fal_client.submit("fal-ai/fast-sdxl", arguments={"prompt": prompt}).get()
        images = result.get("images", [])
        if images:
            url = images[0].get("url", "")
            return {"status": "ok", "url": url, "prompt": prompt}
        return JSONResponse(status_code=500, content={"error": "no image generated"})
    except ImportError:
        return JSONResponse(status_code=501, content={"error": "fal-client not installed"})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/execute")
async def execute_code(request: Request):
    """Execute a code block from agent responses. Requires explicit confirmation."""
    body = await request.json()
    code = body.get("code", "").strip()
    language = body.get("language", "bash").lower()
    if not code:
        return JSONResponse(status_code=400, content={"error": "code required"})
    if language not in ("bash", "python", "python3", "sh", "zsh"):
        return JSONResponse(status_code=400, content={"error": f"unsupported language: {language}"})

    import subprocess
    cmd = ["python3", "-c", code] if language in ("python", "python3") else ["bash", "-c", code]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30, cwd=str(Path.home()))
        return {
            "status": "ok",
            "exit_code": result.returncode,
            "stdout": result.stdout[:5000],
            "stderr": result.stderr[:2000],
        }
    except subprocess.TimeoutExpired:
        return JSONResponse(status_code=408, content={"error": "execution timed out (30s)"})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/search")
async def search_sessions(q: str = "", limit: int = 20):
    """Search across all sessions by content."""
    if not q:
        return {"results": []}
    results = []
    try:
        all_sessions = session_db.list_sessions()
        for sess in all_sessions[:100]:  # cap at 100 sessions to search
            sid = sess.get("id") or sess.get("session_id", "")
            try:
                msgs = list(session_db.get_messages_as_conversation(sid))
                for msg in msgs:
                    content = msg.get("content", "")
                    if q.lower() in content.lower():
                        results.append({
                            "session_id": sid,
                            "session_title": sess.get("title", sid),
                            "role": msg.get("role", ""),
                            "content": content[:200],
                            "match_preview": content[max(0, content.lower().index(q.lower()) - 40):content.lower().index(q.lower()) + 60],
                        })
                        if len(results) >= limit:
                            break
            except Exception:
                pass
            if len(results) >= limit:
                break
    except Exception as e:
        print(f"[iris-bridge] Search error: {e}")
    return {"query": q, "results": results}

@app.get("/channels")
async def list_channels_http():
    return {"channels": _list_channels()}

@app.get("/export/{session_id}")
async def export_session(session_id: str, format: str = "markdown"):
    """Export a session as markdown or JSON."""
    try:
        msgs = session_db.get_messages_as_conversation(session_id)
        messages = list(msgs)
    except Exception:
        messages = []
    # Also try channel transcript
    if not messages:
        messages = channel_mgr.load_messages(session_id)
    if format == "json":
        return {"session_id": session_id, "messages": messages}
    # Markdown format
    lines = [f"# Session: {session_id}\n"]
    for m in messages:
        role = m.get("role", "assistant")
        agent = m.get("agentId") or m.get("agent_id") or ""
        content = m.get("content", "")
        if role == "user":
            lines.append(f"## You\n\n{content}\n")
        elif role == "divider":
            lines.append(f"---\n*{content}*\n")
        else:
            name = agent.capitalize() if agent else "Assistant"
            lines.append(f"## {name}\n\n{content}\n")
    md = "\n".join(lines)
    return JSONResponse(content={"session_id": session_id, "format": "markdown", "content": md})


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
              try:
                # Target-first routing: "dm:talos" or "channel:general"
                target = msg.get("target")
                if target:
                    kind, _, tid = target.partition(":")
                    session_id = "home" if (kind == "dm" and tid == "hermes") else tid
                else:
                    kind = "channel"
                    tid = msg.get("session_id", "default")
                    session_id = tid
                text = msg.get("text", "").strip()[:50000]  # Cap at 50K chars
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
              except Exception as e:
                print(f"[iris-bridge] send_message error: {e}", flush=True)

            # ─── start_council: all agents debate a topic ───
            elif action == "start_council":
              try:
                subject = msg.get("subject", "Open discussion").strip()[:500]
                turns = min(max(int(msg.get("turns", 2)), 1), 5)
                slug = re.sub(r"[^a-z0-9]+", "-", subject.lower())[:30].strip("-")
                channel_id = f"council-{slug}-{uuid.uuid4().hex[:4]}"
                all_agents = list(PROFILE_NAMES)

                # 1. Navigate client FIRST — instant feedback
                await websocket.send_json({
                    "type": "session.resumed",
                    "session_id": channel_id,
                    "messages": [],
                    "activities": [],
                    "title": f"Council: {subject[:40]}",
                    "running_sessions": [],
                })

                # 2. Create channel + Iris intro in background thread (non-blocking)
                def _iris_post(cid: str, text: str):
                    _append_channel_message(cid, "assistant", text, "iris")
                    emit("hermes.message", {"session_id": cid, "text": text, "agentId": "iris", "timestamp": time.time()})

                def _setup_and_run(cid, subj, num_turns, agents):
                    ch = _create_channel(cid, f"Council: {subj[:40]}", agent_ids=agents)
                    emit("channel.created", ch)
                    names = ", ".join(a.capitalize() for a in agents)
                    _iris_post(cid, f"**{subj}**\n\n{num_turns} round{'s' if num_turns > 1 else ''} · {names}")

                # Run council in background thread
                def _run_council(cid: str, subj: str, num_turns: int, agents: list[str]):
                    import random

                    def _cancelled():
                        return channel_mgr.load_meta().get(cid, {}).get("status") == "archived"

                    def _wait_all(agent_list):
                        deadline = time.time() + 300
                        while time.time() < deadline:
                            if _cancelled(): return False
                            if all(agent_queues.get(a, _queue_mod.Queue()).empty() and not agent_current_job.get(a) for a in agent_list):
                                return True
                            time.sleep(1.5)
                        return True

                    # Detect question type: yes/no vs open-ended
                    s = subj.lower().strip()
                    is_yesno = (
                        s.startswith(("should ", "is ", "are ", "can ", "will ", "would ", "do ", "does ", "could "))
                        or "yes or no" in s or "or not" in s
                    )

                    for turn in range(num_turns):
                        if _cancelled(): return
                        rules = "2-3 sentences MAX. Stay in character."

                        if turn == 0:
                            base = f"Council topic: {subj}\n\nRound 1/{num_turns}. Give your take. {rules}"
                        elif turn == num_turns - 1:
                            if is_yesno:
                                base = (
                                    f"FINAL VOTE on: {subj}\n\n"
                                    f"Your FIRST WORD must be YES or NO. Nothing else on the first line.\n"
                                    f"Second line: one sentence why. {rules}"
                                )
                            else:
                                base = (
                                    f"Final round on: {subj}\n\n"
                                    f"Give your concrete recommendation in one sentence. "
                                    f"Start with your key action or approach. {rules}"
                                )
                        else:
                            base = f"Round {turn + 1}/{num_turns} on: {subj}\n\nReact to what others said. {rules}"

                        order = agents[:]
                        random.shuffle(order)

                        # All agents fire in parallel — they see previous rounds but not each other's current round
                        for aid in order:
                            q = agent_queues.get(aid)
                            if q:
                                q.put(AgentJob(
                                    job_id=_next_job_id(), profile=aid,
                                    session_id=cid, message=f"You are {aid.capitalize()}. Argue from YOUR role's perspective. {base}",
                                    kind="channel", channel_id=cid,
                                ))
                        _wait_all(order)

                        if turn < num_turns - 1:
                            next_label = "Final round." if turn + 1 == num_turns - 1 else "Rebuttals."
                            _iris_post(cid, f"**Round {turn + 2}** — {next_label}")

                    # Verdict
                    time.sleep(0.5)
                    transcript = _recent_channel_context(cid, limit=50)

                    if is_yesno:
                        # Tally YES/NO votes
                        yes_v, no_v, abstain = [], [], []
                        for aid in agents:
                            lines = [l for l in transcript.split("\n") if l.startswith(f"[{aid}]")]
                            if not lines: abstain.append(aid); continue
                            content = lines[-1].split("]", 1)[-1].strip()
                            w = content.lstrip("*#> ").split()[0].lower().rstrip(".,!—-:*") if content.strip() else ""
                            if w == "yes": yes_v.append(aid)
                            elif w == "no": no_v.append(aid)
                            elif "yes" in content.lower()[:40]: yes_v.append(aid)
                            elif "no" in content.lower()[:40]: no_v.append(aid)
                            else: abstain.append(aid)

                        total = len(yes_v) + len(no_v)
                        yp = round(100 * len(yes_v) / total) if total else 0
                        if len(yes_v) > len(no_v):
                            dec, margin = "YES", "unanimous" if not no_v else f"{len(yes_v)}-{len(no_v)}"
                        elif len(no_v) > len(yes_v):
                            dec, margin = "NO", "unanimous" if not yes_v else f"{len(no_v)}-{len(yes_v)}"
                        else:
                            dec, margin = "SPLIT", "tied"

                        votes = "\n\n".join(
                            [f"@{a} — **YES**" for a in yes_v] +
                            [f"@{a} — **NO**" for a in no_v] +
                            [f"@{a} — **ABSTAIN**" for a in abstain]
                        )
                        _iris_post(cid, f"**{dec}** ({margin}) · {yp}% yes\n\n{votes}")
                    else:
                        # Open-ended: summarize each agent's final position
                        positions = []
                        for aid in agents:
                            lines = [l for l in transcript.split("\n") if l.startswith(f"[{aid}]")]
                            if lines:
                                content = lines[-1].split("]", 1)[-1].strip()[:150]
                                positions.append(f"@{aid} — {content}")
                        summary = "\n\n".join(positions)
                        _iris_post(cid, f"**Council summary**\n\n{summary}")

                def _council_thread(cid, subj, t, agents):
                    _setup_and_run(cid, subj, t, agents)
                    _run_council(cid, subj, t, agents)
                threading.Thread(target=_council_thread, args=(channel_id, subject, turns, all_agents), daemon=True).start()
              except Exception as e:
                print(f"[iris-bridge] start_council error: {e}", flush=True)

            # ─── evolve: trigger self-evolution (skill, soul, tool, prompt) ───
            elif action in ("evolve_skill", "evolve_soul", "evolve_tool", "evolve_prompt"):
                target = msg.get("skill") or msg.get("profile") or msg.get("tool") or msg.get("file") or ""
                target = target.strip()
                evo_type = action.replace("evolve_", "")
                profile = msg.get("profile", "hermes")
                iterations = min(int(msg.get("iterations", 5)), 20)
                if target:
                    cfg = adapter.reload_config()
                    model_name = cfg.get("model", "gpt-5.4-mini")
                    # Use haiku for evolution (fast, cheap, high rate limits)
                    dspy_model = "anthropic/claude-haiku-4-5-20251001"

                    def _nyx_log(msg_text: str):
                        """Post a message to the Nyx DM as a live evolution update."""
                        emit("hermes.message", {
                            "session_id": "nyx",
                            "text": msg_text,
                            "agentId": "nyx",
                            "timestamp": time.time(),
                        })

                    def _run_evo(t, et, prof, iters, dm):
                        try:
                            import sys as _s
                            evo_path = str(Path.home() / "hermes-ecosystem" / "hermes-agent-self-evolution")
                            if evo_path not in _s.path:
                                _s.path.insert(0, evo_path)

                            _nyx_log(f"🧬 Evolution started — **{et}**: `{t}` ({iters} iterations, model: `{dm}`)")

                            if et == "skill":
                                from evolution.skills.evolve_skill import evolve
                                evolve(skill_name=t, iterations=iters, eval_source="synthetic",
                                       optimizer_model=dm, eval_model=dm, hermes_repo=str(HERMES_DIR))
                            elif et == "soul":
                                from evolution.prompts.evolve_soul import evolve_soul
                                evolve_soul(profile=t, iterations=iters, optimizer_model=dm, eval_model=dm)
                            elif et == "tool":
                                from evolution.tools.evolve_tool import evolve_tool
                                evolve_tool(tool_name=t, iterations=iters, optimizer_model=dm, eval_model=dm,
                                            hermes_repo=str(HERMES_DIR))
                            elif et == "prompt":
                                from evolution.prompts.evolve_prompt import evolve_prompt
                                evolve_prompt(prompt_file=t, iterations=iters, optimizer_model=dm, eval_model=dm)

                            _nyx_log(f"✓ Evolution complete — **{et}**: `{t}` evolved successfully")
                            emit("evolution.completed", {"target": t, "type": et, "profile": prof, "iterations": iters})
                        except Exception as e:
                            _nyx_log(f"✗ Evolution failed — **{et}**: `{t}` — {str(e)[:200]}")
                            print(f"[iris-bridge] Evolution error ({et}/{t}): {e}", flush=True)
                            emit("evolution.error", {"target": t, "type": et, "error": str(e)})

                    threading.Thread(target=_run_evo, args=(target, evo_type, profile, iterations, dspy_model), daemon=True).start()
                    emit("evolution.started", {"target": target, "type": evo_type, "profile": profile, "iterations": iterations, "model": dspy_model})

            # ─── agent_post: an agent speaks in a channel as itself ───
            elif action == "agent_post":
                agent_id = msg.get("agent_id", "")
                channel_id = msg.get("channel_id", "general")
                text = msg.get("text", "").strip()[:50000]
                if not agent_id or not text:
                    continue
                profile = agent_id if agent_id in PROFILE_NAMES else "hermes"
                job = AgentJob(
                    job_id=_next_job_id(),
                    profile=profile,
                    session_id=channel_id,
                    message=text,
                    kind="channel",
                    channel_id=channel_id,
                )
                q = agent_queues.get(profile)
                if q:
                    q.put(job)

            # ─── cancel_response ───
            elif action == "cancel_response":
                session_id = msg.get("session_id", "default")
                with _cancel_lock:
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
                try:
                    sessions_list = session_db.list_sessions_rich(source=None, limit=50)
                except Exception:
                    sessions_list = []
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
                channel_messages = channel_mgr.load_messages(sid)
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
                    try:
                        history = session_db.get_messages_as_conversation(sid)
                        full_history = list(history)
                    except Exception:
                        full_history = []
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
                    "title": (session_db.get_session_title(sid) or "") if sid else "",
                    "running_sessions": list(running_threads.keys()),
                    # Which agents are actively processing in this session
                    "processing_agents": [
                        profile for profile, job in agent_current_job.items()
                        if job and (job.session_id == sid or job.channel_id == sid)
                    ],
                })

            # ─── delete_session ───
            elif action == "delete_session":
                sid = msg.get("session_id", "")
                if sid == HOME_SESSION_ID:
                    pass  # Can't delete home session
                elif sid:
                    try:
                        session_db.delete_session(sid)
                    except Exception:
                        pass
                    sessions.pop(sid, None)
                    session_roster.pop(sid, None)
                    emit("session.deleted", {"session_id": sid})
                    try:
                        sessions_list = session_db.list_sessions_rich(source=None, limit=50)
                    except Exception:
                        sessions_list = []
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
                profile_id = msg.get("profile")
                if profile_id and profile_id in PROFILE_NAMES:
                    from hermes_adapter import get_profile_home
                    home = get_profile_home(profile_id)
                    mem_file = home / "memories" / "MEMORY.md"
                    user_file = home / "memories" / "USER.md"
                    await websocket.send_json({
                        "type": "memory.state",
                        "profile": profile_id,
                        "memory": mem_file.read_text() if mem_file.exists() else "",
                        "user": user_file.read_text() if user_file.exists() else "",
                    })
                else:
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
                for agent_id in PROFILE_NAMES:
                  try:
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
                  except Exception as e:
                    agents_out.append({"id": agent_id, "name": agent_id, "error": str(e), "status": "error"})
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

            elif action == "pin_message":
                cid = msg.get("channel_id") or msg.get("session_id", "")
                mid = msg.get("message_id", "")
                if cid and mid and channel_mgr.pin_message(cid, mid):
                    emit("channel.pinned", {"channel_id": cid, "message_id": mid, "pinned": channel_mgr.get_pinned(cid)})

            elif action == "unpin_message":
                cid = msg.get("channel_id") or msg.get("session_id", "")
                mid = msg.get("message_id", "")
                if cid and mid and channel_mgr.unpin_message(cid, mid):
                    emit("channel.pinned", {"channel_id": cid, "message_id": mid, "pinned": channel_mgr.get_pinned(cid)})

            elif action == "fork_session":
                source_sid = msg.get("session_id", "")
                if not source_sid:
                    continue
                at_message_idx = msg.get("at_message_index", -1)
                try:
                    source_msgs = list(session_db.get_messages_as_conversation(source_sid))
                    fork_msgs = source_msgs[:at_message_idx + 1] if at_message_idx >= 0 else source_msgs
                    new_sid = f"{source_sid}-fork-{uuid.uuid4().hex[:6]}"
                    cfg = _get_model_info()
                    session_db.create_session(session_id=new_sid, source="iris", model=cfg["model"])
                    for m in fork_msgs:
                        session_db.append_message(new_sid, m.get("role", "user"), content=m.get("content", ""))
                    emit("session.created", {"session_id": new_sid, "forked_from": source_sid, "message_count": len(fork_msgs)})
                    await websocket.send_json({"type": "session.forked", "session_id": new_sid, "forked_from": source_sid, "message_count": len(fork_msgs)})
                except Exception as e:
                    await websocket.send_json({"type": "session.fork_error", "error": str(e)})

            elif action == "get_pinned":
                cid = msg.get("channel_id") or msg.get("session_id", "")
                await websocket.send_json({"type": "channel.pinned", "channel_id": cid, "pinned": channel_mgr.get_pinned(cid)})

            elif action == "set_channel_agents":
                cid = msg.get("channel_id", "")
                agent_ids = msg.get("agent_ids", [])
                if channel_mgr.set_agent_ids(cid, agent_ids):
                    emit("channel.updated", {"channel_id": cid, "agent_ids": channel_mgr.get_agent_ids(cid)})

            elif action == "add_channel_agent":
                cid = msg.get("channel_id", "")
                aid = msg.get("agent_id", "")
                if channel_mgr.add_agent(cid, aid):
                    emit("channel.updated", {"channel_id": cid, "agent_ids": channel_mgr.get_agent_ids(cid)})

            elif action == "remove_channel_agent":
                cid = msg.get("channel_id", "")
                aid = msg.get("agent_id", "")
                if channel_mgr.remove_agent(cid, aid):
                    emit("channel.updated", {"channel_id": cid, "agent_ids": channel_mgr.get_agent_ids(cid)})

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
                if profile in PROFILE_NAMES:
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
                profile_id = msg.get("profile")
                if profile_id and profile_id in PROFILE_NAMES:
                    from hermes_adapter import get_profile_home
                    home = get_profile_home(profile_id)
                    cfg = get_config(home)
                else:
                    cfg = get_config()
                skills = list_skills()
                disabled = cfg.get("skills", {}).get("disabled", [])
                for s in skills:
                    s["enabled"] = s["name"] not in disabled
                await websocket.send_json({
                    "type": "skills.list",
                    "profile": profile_id or "hermes",
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
                        _tmp = PUSH_TOKENS_FILE.with_suffix(".tmp"); _tmp.write_text(json.dumps(tokens, indent=2)); _tmp.replace(PUSH_TOKENS_FILE)

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

    # Start background cleanup thread
    threading.Thread(target=_cleanup_stale_state, daemon=True, name="state-cleanup").start()

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
