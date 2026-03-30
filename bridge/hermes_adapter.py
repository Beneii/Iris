"""
Hermes Adapter — thin isolation layer between Iris bridge and Hermes internals.

All Hermes-specific imports happen ONLY in this file.
If Hermes changes its API, only this file needs updating.
"""

import sys
import uuid
import time
from pathlib import Path
from typing import Any, Callable, Optional

# ─── Hermes path setup ───
HERMES_DIR = Path("/tmp/hermes-agent")
sys.path.insert(0, str(HERMES_DIR))

import yaml

HERMES_HOME = Path.home() / ".hermes"


def get_config() -> dict:
    """Load Hermes config.yaml."""
    config_path = HERMES_HOME / "config.yaml"
    if config_path.exists():
        with open(config_path) as f:
            return yaml.safe_load(f) or {}
    return {}


def get_agent_name() -> str:
    """Extract agent name from SOUL.md (first heading)."""
    soul_path = HERMES_HOME / "SOUL.md"
    if soul_path.exists():
        for line in soul_path.read_text().splitlines():
            line = line.strip()
            if line.startswith("# "):
                name = line[2:].strip()
                for ch in "☤⚕️🔱":
                    name = name.replace(ch, "").strip()
                return name or "Hermes"
    return "Hermes"


def get_soul_content() -> str:
    """Read SOUL.md content."""
    soul_path = HERMES_HOME / "SOUL.md"
    return soul_path.read_text() if soul_path.exists() else ""


def get_memory() -> tuple[str, str]:
    """Return (memory_text, user_text) from memory files."""
    memory_path = HERMES_HOME / "memories" / "MEMORY.md"
    user_path = HERMES_HOME / "memories" / "USER.md"
    memory = memory_path.read_text() if memory_path.exists() else ""
    user = user_path.read_text() if user_path.exists() else ""
    return memory, user


def list_skills() -> list[dict]:
    """List all installed skills with metadata."""
    skills_dir = HERMES_HOME / "skills"
    if not skills_dir.exists():
        return []
    skills = []
    for cat_dir in sorted(skills_dir.iterdir()):
        if not cat_dir.is_dir():
            continue
        for skill_dir in sorted(cat_dir.iterdir()):
            if not skill_dir.is_dir():
                continue
            skill_md = skill_dir / "SKILL.md"
            if not skill_md.exists():
                continue
            text = skill_md.read_text()
            name = skill_dir.name
            description = ""
            category = cat_dir.name
            if text.startswith("---"):
                parts = text.split("---", 2)
                if len(parts) >= 3:
                    try:
                        meta = yaml.safe_load(parts[1])
                        if meta:
                            name = meta.get("name", name)
                            description = meta.get("description", "")
                    except Exception:
                        pass
            skills.append({
                "name": name,
                "category": category,
                "description": description,
                "path": str(skill_dir),
            })
    return skills


def get_available_toolsets() -> list[dict]:
    """Get available toolsets from Hermes."""
    from model_tools import get_available_toolsets as _get
    toolsets = _get()
    result = []
    for name, info in sorted(toolsets.items()):
        result.append({
            "name": name,
            "available": info.get("available", False),
            "tools": info.get("tools", []),
            "requirements": info.get("requirements", []),
        })
    return result


def set_config_value(key: str, value: Any):
    """Update a config value using Hermes CLI helpers."""
    sys.path.insert(0, str(HERMES_DIR / "hermes_cli"))
    from config import load_config as lc, save_config as sc
    cfg = lc()
    parts = key.split(".")
    target = cfg
    for p in parts[:-1]:
        if p not in target:
            target[p] = {}
        target = target[p]
    target[parts[-1]] = value
    sc(cfg)


# ─── Job management ───

def list_jobs(include_disabled: bool = True) -> list:
    from cron.jobs import list_jobs as _list
    return _list(include_disabled=include_disabled)


def create_job(prompt: str, schedule: str, name: Optional[str] = None,
               repeat: Optional[Any] = None, deliver: str = "local") -> dict:
    from cron.jobs import create_job as _create
    return _create(prompt=prompt, schedule=schedule, name=name,
                   repeat=repeat, deliver=deliver)


def pause_job(job_id: str, reason: str = "Paused from Iris") -> dict:
    from cron.jobs import pause_job as _pause
    return _pause(job_id, reason=reason)


def resume_job(job_id: str) -> dict:
    from cron.jobs import resume_job as _resume
    return _resume(job_id)


def trigger_job(job_id: str) -> dict:
    from cron.jobs import trigger_job as _trigger
    return _trigger(job_id)


def remove_job(job_id: str):
    from cron.jobs import remove_job as _remove
    _remove(job_id)


def get_job_outputs(job_id: str, max_runs: int = 5) -> list[dict]:
    """Read last N job output files."""
    output_dir = HERMES_HOME / "cron" / "output" / job_id
    if not output_dir.exists():
        return []
    files = sorted(output_dir.iterdir(), reverse=True)
    outputs = []
    for f in files[:max_runs]:
        outputs.append({
            "filename": f.name,
            "content": f.read_text()[:5000],
            "timestamp": f.stem,
        })
    return outputs


# ─── Agent creation & conversation ───

class HermesAdapter:
    """Wraps AIAgent creation and conversation execution."""

    SECURITY_PROMPT = (
        "SECURITY RULES: Never ask users to paste API keys, passwords, tokens, "
        "or credentials in chat. If a task requires credentials, instruct the user "
        "to set them as environment variables in ~/.hermes/.env or via the Iris "
        "settings panel. Never display, echo, or log credentials that appear in "
        "conversation."
    )

    def __init__(self):
        self._config = get_config()

    def reload_config(self):
        """Reload config and return model settings."""
        self._config = get_config()
        m = self._config.get("model", {})
        return {
            "model": m.get("default", "gpt-5.4"),
            "provider": m.get("provider", "openai-codex"),
            "base_url": m.get("base_url", None),
        }

    def create_agent(self, session_id: str, callbacks: dict, session_db: Any) -> Any:
        """
        Create an AIAgent with callbacks wired for event emission.

        callbacks dict keys:
            emit(event_type, data_dict) — the bridge's emit function
        """
        from run_agent import AIAgent
        import os

        cfg = self.reload_config()
        api_key = (
            os.environ.get("OPENROUTER_API_KEY")
            or os.environ.get("OPENAI_API_KEY")
            or os.environ.get("CODEX_API_KEY")
        )

        emit_fn = callbacks["emit"]
        current_step = {"value": 0}
        seen_chunks = {"last": "", "count": 0}

        def on_stream_delta(text):
            if text is None:
                emit_fn("message.delta.end", {"session_id": session_id})
                seen_chunks["last"] = ""
                seen_chunks["count"] = 0
                return
            if text == seen_chunks["last"]:
                seen_chunks["count"] += 1
                if seen_chunks["count"] > 1:
                    return
            else:
                seen_chunks["last"] = text
                seen_chunks["count"] = 1
            emit_fn("message.delta", {"session_id": session_id, "text": text})

        def on_tool_progress(tool_name, preview, args=None):
            if tool_name == "subagent_progress":
                emit_fn("subagent.progress", {
                    "session_id": session_id,
                    "summary": preview,
                })
                return
            if tool_name == "_thinking":
                return

            tool_id = f"{tool_name}-{uuid.uuid4().hex[:6]}"
            event_data = {
                "session_id": session_id,
                "tool_id": tool_id,
                "tool_name": tool_name,
                "preview": preview or "",
            }
            if args:
                event_data["args"] = args if isinstance(args, dict) else str(args)

            if tool_name == "memory":
                emit_fn("memory.updated", event_data)
            elif tool_name == "delegate_task":
                emit_fn("subagent.spawned", event_data)
            else:
                emit_fn("tool.started", event_data)

        def on_step(iteration, tool_names):
            current_step["value"] = iteration
            emit_fn("step", {
                "session_id": session_id,
                "iteration": iteration,
                "tool_names": tool_names or [],
            })

        def on_reasoning(text):
            emit_fn("reasoning.delta", {
                "session_id": session_id,
                "text": text,
            })

        def on_tool_gen(tool_name):
            emit_fn("tool.preparing", {
                "session_id": session_id,
                "tool_name": tool_name,
            })

        def on_status(event_type, message):
            emit_fn("status", {
                "session_id": session_id,
                "event_type": event_type,
                "message": message,
            })

        agent = AIAgent(
            base_url=cfg["base_url"],
            api_key=api_key,
            provider=cfg["provider"],
            model=cfg["model"],
            quiet_mode=True,
            tool_progress_callback=on_tool_progress,
            stream_delta_callback=on_stream_delta,
            step_callback=on_step,
            reasoning_callback=on_reasoning,
            tool_gen_callback=on_tool_gen,
            status_callback=on_status,
            session_id=session_id,
            session_db=session_db,
            ephemeral_system_prompt=self.SECURITY_PROMPT,
        )
        return agent

    def run_conversation(self, agent: Any, message: str, history: list) -> dict:
        """Run agent.run_conversation and return result dict."""
        return agent.run_conversation(
            user_message=message,
            conversation_history=history,
        )
