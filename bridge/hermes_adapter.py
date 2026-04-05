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
HERMES_DIR = Path.home() / "hermes-agent"
sys.path.insert(0, str(HERMES_DIR))

import yaml

HERMES_HOME = Path.home() / ".hermes"

# ─── Profile-aware agent channels ───
AGENT_PROFILES = {"hermes", "talos", "icarus", "charon", "nyx"}


def get_profile_home(profile_name: str) -> Path:
    """Resolve a profile name to its HERMES_HOME directory."""
    return HERMES_HOME / "profiles" / profile_name


def resolve_profile_for_session(session_id: str) -> Optional[str]:
    """Map an Iris session/channel to a Hermes profile name.

    Named agent channels always route to their matching profile. Everything else
    routes to Hermes (the orchestrator profile) so non-agent chats are isolated
    from the default home directory.
    """
    if session_id in AGENT_PROFILES:
        return session_id
    return "hermes"


def get_config(home: Optional[Path] = None) -> dict:
    """Load Hermes config.yaml from a specific home directory."""
    config_path = (home or HERMES_HOME) / "config.yaml"
    if config_path.exists():
        with open(config_path) as f:
            return yaml.safe_load(f) or {}
    return {}


def get_agent_name(home: Optional[Path] = None) -> str:
    """Extract agent name from SOUL.md (first heading)."""
    soul_path = (home or HERMES_HOME) / "SOUL.md"
    if soul_path.exists():
        for line in soul_path.read_text().splitlines():
            line = line.strip()
            if line.startswith("# "):
                name = line[2:].strip()
                # Strip common decorative chars and "— role" suffixes
                for ch in "☤⚕️🔱":
                    name = name.replace(ch, "").strip()
                if "—" in name:
                    name = name.split("—")[0].strip()
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


PROVIDER_MODELS = {
    "anthropic": {
        "default": "claude-sonnet-4-6-20250627",
        "models": [
            "claude-opus-4-6-20250627",
            "claude-sonnet-4-6-20250627",
            "claude-haiku-4-5-20251001",
            "claude-opus-4-20250514",
            "claude-sonnet-4-20250514",
        ],
    },
    "openai-codex": {
        "default": "gpt-5.4-mini",
        "models": ["gpt-5.4-mini", "gpt-5.4", "o3", "o4-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano"],
    },
    "deepseek": {
        "default": "deepseek-r1",
        "models": ["deepseek-r1", "deepseek-chat", "deepseek-coder"],
    },
    "copilot": {
        "default": "claude-sonnet-4-6-20250627",
        "models": ["claude-sonnet-4-6-20250627", "claude-opus-4-6-20250627", "gpt-4.1", "o4-mini"],
    },
    "copilot-acp": {
        "default": "claude-sonnet-4-6-20250627",
        "models": ["claude-sonnet-4-6-20250627", "claude-opus-4-6-20250627", "gpt-4.1", "o4-mini"],
    },
    "nous": {
        "default": "hermes-3-llama-3.1-405b",
        "models": ["hermes-3-llama-3.1-405b", "hermes-3-llama-3.1-70b", "deephermes-3-llama-3-8b"],
    },
    "zai": {
        "default": "glm-4-plus",
        "models": ["glm-4-plus", "glm-4", "glm-4-flash"],
    },
    "kimi-coding": {
        "default": "kimi-k2",
        "models": ["kimi-k2", "moonshot-v1-128k", "moonshot-v1-32k"],
    },
    "minimax": {
        "default": "MiniMax-M1",
        "models": ["MiniMax-M1", "MiniMax-Text-01"],
    },
}

def list_providers() -> list:
    """List all known providers with their configuration status and models."""
    import os
    from pathlib import Path
    from dotenv import load_dotenv
    load_dotenv(Path.home() / ".hermes" / ".env")
    _cli = str(HERMES_DIR / "hermes_cli")
    if _cli not in sys.path: sys.path.insert(0, _cli)
    from auth import PROVIDER_REGISTRY
    results = []
    for pid, p in PROVIDER_REGISTRY.items():
        has_key = False
        if hasattr(p, "api_key_env_vars") and p.api_key_env_vars:
            has_key = any(os.environ.get(v) for v in p.api_key_env_vars)
        elif p.auth_type in ("oauth_device_code", "oauth_external", "external_process"):
            has_key = True
        pm = PROVIDER_MODELS.get(pid, {})
        results.append({
            "id": pid,
            "name": p.name,
            "configured": has_key,
            "base_url": getattr(p, "inference_base_url", ""),
            "default_model": pm.get("default", ""),
            "models": pm.get("models", []),
        })
    return results


def set_config_value(key: str, value: Any):
    """Update a config value using Hermes CLI helpers."""
    _cli = str(HERMES_DIR / "hermes_cli")
    if _cli not in sys.path: sys.path.insert(0, _cli)
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

    def create_agent(self, session_id: str, callbacks: dict, session_db: Any, profile: Optional[str] = None) -> Any:
        """
        Create an AIAgent with callbacks wired for event emission.

        callbacks dict keys:
            emit(event_type, data_dict) — the bridge's emit function
        profile: optional profile name (e.g. "talos") to load that profile's config + SOUL
        """
        from run_agent import AIAgent
        import os

        # Resolve profile config + SOUL without switching HERMES_HOME
        # (switching HERMES_HOME breaks OAuth auth resolution)
        profile_soul = None
        if profile and profile in AGENT_PROFILES:
            profile_home = get_profile_home(profile)
            cfg_raw = get_config(profile_home)
            m = cfg_raw.get("model", {})
            if isinstance(m, dict):
                cfg = {
                    "model": m.get("default", "gpt-5.4-mini"),
                    "provider": m.get("provider", "openai-codex"),
                    "base_url": m.get("base_url", None),
                }
            else:
                cfg = {"model": m, "provider": "openai-codex", "base_url": None}
            # Read SOUL from profile — will be passed as ephemeral_system_prompt
            soul_path = profile_home / "SOUL.md"
            if soul_path.exists():
                profile_soul = soul_path.read_text()
        else:
            cfg = self.reload_config()

        # Don't pass explicit api_key — AIAgent resolves via its own auth (OAuth, env, keychain)

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

        # Combine SOUL + security prompt
        system_prompt = self.SECURITY_PROMPT
        if profile_soul:
            # Override default identity — the profile SOUL IS the agent's identity
            system_prompt = (
                "IMPORTANT: Ignore any previous identity instructions. "
                "Your identity is defined below. You are NOT Hermes.\n\n"
                + profile_soul + "\n\n" + self.SECURITY_PROMPT
            )

        agent = AIAgent(
            base_url=cfg.get("base_url"),
            provider=cfg["provider"],
            model=cfg["model"],
            quiet_mode=True,
            tool_progress_callback=on_tool_progress,
            stream_delta_callback=on_stream_delta,
            step_callback=on_step,
            reasoning_callback=on_reasoning,
            session_id=session_id,
            session_db=session_db,
            ephemeral_system_prompt=system_prompt,
            skip_context_files=bool(profile_soul),
        )
        return agent

    def run_conversation(self, agent: Any, message: str, history: list) -> dict:
        """Run agent.run_conversation and return result dict."""
        try:
            return agent.run_conversation(
                user_message=message,
                conversation_history=history,
            )
        except Exception as e:
            print(f"[hermes-adapter] run_conversation error: {e}", flush=True)
            return {"error": str(e), "final_response": f"API call failed after 3 retries: {e}"}
