"""
Channel management for the Iris bridge.

Handles channel metadata (active/archived), message transcripts,
context retrieval, and @mention extraction.
"""

import json
import re
import time
import uuid
from pathlib import Path
from typing import Optional

PROFILE_NAMES = {"hermes", "talos", "icarus", "charon", "nyx"}


class ChannelManager:
    """Manages channel metadata, transcripts, and mentions."""

    def __init__(self, channels_dir: Path):
        self.channels_dir = channels_dir
        self.channels_dir.mkdir(parents=True, exist_ok=True)
        self.meta_path = channels_dir / "_meta.json"

    # ─── Metadata ───

    def load_meta(self) -> dict[str, dict]:
        if self.meta_path.exists():
            try:
                return json.loads(self.meta_path.read_text())
            except Exception:
                pass
        # Bootstrap: scan existing JSON files + ensure general exists
        meta: dict[str, dict] = {}
        for f in self.channels_dir.glob("*.json"):
            if f.name.startswith("_"):
                continue
            cid = f.stem
            meta[cid] = {"name": cid, "status": "active", "created_at": f.stat().st_mtime}
        if "general" not in meta:
            meta["general"] = {"name": "general", "status": "active", "created_at": time.time()}
        self.save_meta(meta)
        return meta

    def save_meta(self, meta: dict[str, dict]):
        tmp = self.meta_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(meta, indent=2, default=str))
        tmp.replace(self.meta_path)

    def create(self, channel_id: str, name: str = "", project_id: str = "", agent_ids: Optional[list[str]] = None) -> dict:
        meta = self.load_meta()
        valid_agents = [a for a in (agent_ids or ["hermes"]) if a in PROFILE_NAMES]
        entry = {
            "name": name or channel_id,
            "status": "active",
            "project_id": project_id,
            "created_at": time.time(),
            "agent_ids": valid_agents or ["hermes"],
        }
        meta[channel_id] = entry
        self.save_meta(meta)
        return {"id": channel_id, **entry}

    def archive(self, channel_id: str) -> bool:
        meta = self.load_meta()
        if channel_id in meta:
            meta[channel_id]["status"] = "archived"
            meta[channel_id]["archived_at"] = time.time()
            self.save_meta(meta)
            return True
        return False

    def unarchive(self, channel_id: str) -> bool:
        meta = self.load_meta()
        if channel_id in meta:
            meta[channel_id]["status"] = "active"
            meta[channel_id].pop("archived_at", None)
            self.save_meta(meta)
            return True
        return False

    def list_all(self) -> list[dict]:
        meta = self.load_meta()
        return [{"id": cid, **info} for cid, info in meta.items()]

    def pin_message(self, channel_id: str, message_id: str) -> bool:
        meta = self.load_meta()
        if channel_id not in meta:
            return False
        pins = meta[channel_id].setdefault("pinned", [])
        if message_id not in pins:
            pins.append(message_id)
            self.save_meta(meta)
        return True

    def unpin_message(self, channel_id: str, message_id: str) -> bool:
        meta = self.load_meta()
        if channel_id not in meta:
            return False
        pins = meta[channel_id].get("pinned", [])
        if message_id in pins:
            pins.remove(message_id)
            meta[channel_id]["pinned"] = pins
            self.save_meta(meta)
            return True
        return False

    def get_pinned(self, channel_id: str) -> list[dict]:
        meta = self.load_meta()
        pin_ids = meta.get(channel_id, {}).get("pinned", [])
        if not pin_ids:
            return []
        msgs = self.load_messages(channel_id)
        return [m for m in msgs if m.get("id") in pin_ids]

    def set_agent_ids(self, channel_id: str, agent_ids: list[str]) -> bool:
        meta = self.load_meta()
        if channel_id not in meta:
            return False
        valid = [a for a in agent_ids if a in PROFILE_NAMES]
        meta[channel_id]["agent_ids"] = valid or ["hermes"]
        self.save_meta(meta)
        return True

    def add_agent(self, channel_id: str, agent_id: str) -> bool:
        if agent_id not in PROFILE_NAMES:
            return False
        meta = self.load_meta()
        if channel_id not in meta:
            return False
        ids = meta[channel_id].setdefault("agent_ids", ["hermes"])
        if agent_id not in ids:
            ids.append(agent_id)
            self.save_meta(meta)
        return True

    def remove_agent(self, channel_id: str, agent_id: str) -> bool:
        meta = self.load_meta()
        if channel_id not in meta:
            return False
        ids = meta[channel_id].get("agent_ids", [])
        if agent_id in ids:
            ids.remove(agent_id)
            if not ids:
                ids.append("hermes")  # always keep at least one
            meta[channel_id]["agent_ids"] = ids
            self.save_meta(meta)
            return True
        return False

    def get_agent_ids(self, channel_id: str) -> list[str]:
        meta = self.load_meta()
        info = meta.get(channel_id, {})
        ids = info.get("agent_ids") or ["hermes"]
        return [a for a in ids if a in PROFILE_NAMES] or ["hermes"]

    # ─── Transcripts ───

    def _transcript_path(self, channel_id: str) -> Path:
        safe = re.sub(r"[^a-zA-Z0-9._-]", "_", channel_id)[:64]  # Cap at 64 chars
        return self.channels_dir / f"{safe}.json"

    def load_messages(self, channel_id: str) -> list[dict]:
        path = self._transcript_path(channel_id)
        if not path.exists():
            return []
        try:
            data = json.loads(path.read_text())
            return data if isinstance(data, list) else []
        except Exception as e:
            print(f"[channels] Failed to load transcript for {channel_id}: {e}")
            return []

    def save_messages(self, channel_id: str, messages: list[dict]):
        path = self._transcript_path(channel_id)
        tmp = path.with_suffix(path.suffix + ".tmp")
        try:
            tmp.write_text(json.dumps(messages, default=str))
            tmp.replace(path)
        except Exception as e:
            print(f"[channels] Failed to save transcript for {channel_id}: {e}")

    def append_message(self, channel_id: str, role: str, content: str, agent_id: Optional[str] = None):
        msgs = self.load_messages(channel_id)
        msgs.append({
            "id": uuid.uuid4().hex,
            "role": role,
            "content": content,
            "timestamp": time.time(),
            "agentId": agent_id,
        })
        self.save_messages(channel_id, msgs)

    def recent_context(self, channel_id: str, limit: int = 18) -> str:
        msgs = self.load_messages(channel_id)[-limit:]
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


# ─── Mention extraction (stateless utility) ───

def extract_agent_mentions(text: str) -> tuple[list[str], str]:
    """Extract @agent mentions from text. Returns (agent_ids, stripped_text)."""
    mentions = re.findall(r"@([a-zA-Z0-9_-]+)", text)
    agent_mentions = [m.lower() for m in mentions if m.lower() in PROFILE_NAMES]
    if not agent_mentions:
        return [], text.strip()
    stripped = re.sub(
        r"(?:^|\s)@(?:hermes|talos|icarus|charon|nyx)\b", "", text, flags=re.IGNORECASE
    ).strip()
    return list(dict.fromkeys(agent_mentions)), stripped or text.strip()
