"""Profile-backed Hermes runtimes for Iris bridge.

Each agent profile gets its own worker process with an isolated HERMES_HOME.
Hermes/Talos/Icarus/Charon are request workers. Nyx is the daemon profile and
runs an internal supervisor loop inside its own process, not in the bridge.
"""

from __future__ import annotations

import json
import multiprocessing as mp
import os
import queue
import sys
import threading
import time
import uuid
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Optional
import http.client
from urllib.parse import urlparse

HERMES_DIR = Path.home() / "hermes-agent"
sys.path.insert(0, str(HERMES_DIR))

PROFILE_NAMES = ("hermes", "talos", "icarus", "charon", "nyx")
REGISTRY_PATH = Path.home() / ".hermes" / "iris_profile_runtimes.json"


@dataclass
class RuntimeStatus:
    profile: str
    alive: bool
    pid: Optional[int] = None
    started_at: Optional[float] = None
    last_error: Optional[str] = None
    restart_count: int = 0


class ProfileRuntime:
    def __init__(self, profile: str):
        self.profile = profile
        self.profile_home = Path.home() / ".hermes" / "profiles" / profile
        self.ctx = mp.get_context("spawn")
        self.request_q: mp.Queue = self.ctx.Queue()
        self.event_q: mp.Queue = self.ctx.Queue()
        self.process: Optional[mp.Process] = None
        self.started_at: Optional[float] = None
        self.last_error: Optional[str] = None
        self.restart_count: int = 0
        self._lock = threading.Lock()

    def start(self) -> None:
        if self.process and self.process.is_alive():
            return
        self.process = self.ctx.Process(
            target=_worker_main,
            args=(self.profile, str(self.profile_home), self.request_q, self.event_q, str(REGISTRY_PATH)),
            daemon=True,
            name=f"iris-{self.profile}-runtime",
        )
        self.process.start()
        self.started_at = time.time()
        self.restart_count += 1

    def status(self) -> RuntimeStatus:
        alive = bool(self.process and self.process.is_alive())
        return RuntimeStatus(
            profile=self.profile,
            alive=alive,
            pid=self.process.pid if self.process and self.process.pid else None,
            started_at=self.started_at,
            last_error=self.last_error,
            restart_count=self.restart_count,
        )

    def clear_cache(self) -> None:
        """Tell the worker to clear its cached agent sessions so config changes take effect."""
        if self.process and self.process.is_alive():
            self.request_q.put({"type": "clear_cache"})

    def health_check(self, timeout: float = 2.0) -> dict:
        """Ping the worker and return health info. Returns empty dict if unhealthy."""
        if not self.process or not self.process.is_alive():
            return {"alive": False, "profile": self.profile}
        request_id = str(uuid.uuid4())
        self.request_q.put({"type": "health_check", "request_id": request_id})
        deadline = time.time() + timeout
        stashed = []
        try:
            while time.time() < deadline:
                try:
                    event = self.event_q.get(timeout=0.2)
                    if event.get("request_id") == request_id and event.get("kind") == "health":
                        return {**event, "alive": True}
                    stashed.append(event)
                except Exception:
                    continue
        finally:
            # Put back non-matching events
            for e in stashed:
                self.event_q.put(e)
        return {"alive": False, "profile": self.profile, "timeout": True}

    def restart(self) -> None:
        """Kill and restart the worker process."""
        if self.process and self.process.is_alive():
            self.process.terminate()
            self.process.join(timeout=5)
        self.process = None
        self.last_error = None
        self.start()

    def run(
        self,
        session_id: str,
        message: Any,
        history: list,
        emit,
        images: Optional[list] = None,
        attachments: Optional[list] = None,
        timeout: float = 1800.0,
    ) -> dict:
        """Run a conversation inside this profile worker and stream events back."""
        with self._lock:
            self.start()
            request_id = uuid.uuid4().hex
            payload = {
                "type": "run",
                "request_id": request_id,
                "session_id": session_id,
                "message": message,
                "history": history,
                "images": images or [],
                "attachments": attachments or [],
            }
            self.request_q.put(payload)

            deadline = time.time() + timeout
            while True:
                remaining = max(0.1, deadline - time.time())
                try:
                    event = self.event_q.get(timeout=remaining)
                except queue.Empty:
                    self.last_error = f"profile runtime '{self.profile}' timed out"
                    raise TimeoutError(self.last_error)

                if event.get("request_id") != request_id:
                    continue

                kind = event.get("kind")
                if kind == "event":
                    emit(event["event_type"], event.get("data", {}))
                    continue
                if kind == "error":
                    self.last_error = event.get("error", "unknown profile runtime error")
                    raise RuntimeError(self.last_error)
                if kind == "done":
                    self.last_error = None
                    return event.get("result", {})


class ProfileRuntimeManager:
    def __init__(self):
        self._runtimes: dict[str, ProfileRuntime] = {}
        self._lock = threading.Lock()

    def ensure(self, profile: str) -> ProfileRuntime:
        with self._lock:
            runtime = self._runtimes.get(profile)
            if runtime is None:
                runtime = ProfileRuntime(profile)
                self._runtimes[profile] = runtime
            runtime.start()
            return runtime

    def run(
        self,
        profile: str,
        session_id: str,
        message: Any,
        history: list,
        emit,
        images: Optional[list] = None,
        attachments: Optional[list] = None,
        timeout: float = 1800.0,
    ) -> dict:
        runtime = self.ensure(profile)
        return runtime.run(
            session_id=session_id,
            message=message,
            history=history,
            emit=emit,
            images=images,
            attachments=attachments,
            timeout=timeout,
        )

    def clear_all_caches(self) -> None:
        """Clear cached agents in all runtimes so config changes take effect."""
        with self._lock:
            for runtime in self._runtimes.values():
                runtime.clear_cache()

    def restart_profile(self, profile: str) -> None:
        """Restart a specific profile's worker."""
        with self._lock:
            runtime = self._runtimes.get(profile)
            if runtime:
                runtime.restart()

    def health_check_all(self) -> dict[str, dict]:
        """Run health checks on all runtimes."""
        results = {}
        with self._lock:
            for name, runtime in self._runtimes.items():
                results[name] = runtime.health_check()
        return results

    def statuses(self) -> list[RuntimeStatus]:
        with self._lock:
            return [runtime.status() for runtime in self._runtimes.values()]

    def snapshot(self) -> dict[str, dict[str, Any]]:
        with self._lock:
            return {name: asdict(runtime.status()) for name, runtime in self._runtimes.items()}

    def write_registry(self, path: Optional[Path] = None) -> None:
        dest = path or REGISTRY_PATH
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_suffix(dest.suffix + ".tmp")
        payload = {
            "updated_at": time.time(),
            "runtimes": self.snapshot(),
        }
        tmp.write_text(json.dumps(payload, indent=2, sort_keys=True))
        tmp.replace(dest)

    def restart(self, profile: str) -> ProfileRuntime:
        with self._lock:
            runtime = self._runtimes.get(profile)
            if runtime is None:
                runtime = ProfileRuntime(profile)
                self._runtimes[profile] = runtime
            if runtime.process and runtime.process.is_alive():
                runtime.process.terminate()
                runtime.process.join(timeout=5)
            runtime.start()
            self.write_registry()
            return runtime

    def start_profiles(self, profiles: list[str]) -> None:
        for profile in profiles:
            self.ensure(profile)
        self.write_registry()

_MANAGER: Optional[ProfileRuntimeManager] = None


def get_runtime_manager() -> ProfileRuntimeManager:
    global _MANAGER
    if _MANAGER is None:
        _MANAGER = ProfileRuntimeManager()
    return _MANAGER


def _worker_main(
    profile: str,
    profile_home: str,
    request_q,
    event_q,
    registry_path: str,
) -> None:
    """Worker process entrypoint."""
    os.environ["HERMES_HOME"] = profile_home
    try:
        import sys as _sys
        _sys.path.insert(0, str(HERMES_DIR))
        from hermes_adapter import HermesAdapter
        from hermes_state import SessionDB

        adapter = HermesAdapter()
        session_db = SessionDB()
        sessions: dict[str, dict[str, Any]] = {}
        start_time = time.time()

        if profile == "nyx":
            supervisor = threading.Thread(
                target=_nyx_supervisor_loop,
                args=(str(REGISTRY_PATH),),
                daemon=True,
                name="nyx-supervisor",
            )
            supervisor.start()

        while True:
            req = request_q.get()
            if req.get("type") == "shutdown":
                break
            if req.get("type") == "clear_cache":
                sessions.clear()
                continue
            if req.get("type") == "health_check":
                event_q.put({
                    "request_id": req.get("request_id", ""),
                    "kind": "health",
                    "profile": profile,
                    "cached_sessions": len(sessions),
                    "uptime": time.time() - start_time,
                })
                continue
            if req.get("type") != "run":
                continue

            request_id = req["request_id"]
            session_id = req["session_id"]
            message = req["message"]
            history = req.get("history", [])
            images = req.get("images", [])

            def emit_proxy(event_type: str, data: dict) -> None:
                event_q.put({
                    "request_id": request_id,
                    "kind": "event",
                    "event_type": event_type,
                    "data": data,
                })

            try:
                if session_id not in sessions:
                    sessions[session_id] = {
                        "agent": adapter.create_agent(
                            session_id,
                            {"emit": emit_proxy},
                            session_db,
                            profile=profile,
                        ),
                        "history": [],
                    }

                agent = sessions[session_id]["agent"]
                user_input = message
                if images:
                    content_blocks = [{"type": "text", "text": message if isinstance(message, str) else ""}]
                    for img in images:
                        content_blocks.append({
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": img.get("mime", "image/png"),
                                "data": img.get("data", ""),
                            },
                        })
                    user_input = content_blocks

                result = adapter.run_conversation(agent, user_input, history)
                if result and "messages" in result:
                    sessions[session_id]["history"] = result["messages"]

                event_q.put({
                    "request_id": request_id,
                    "kind": "done",
                    "result": result or {},
                })
            except Exception as e:  # pragma: no cover - runtime isolation boundary
                event_q.put({
                    "request_id": request_id,
                    "kind": "error",
                    "error": str(e),
                })
    except Exception as e:  # pragma: no cover - worker bootstrap failure
        event_q.put({
            "request_id": "bootstrap",
            "kind": "error",
            "error": f"profile worker bootstrap failed for {profile}: {e}",
        })


def _nyx_supervisor_loop(registry_path: str) -> None:
    """Run inside Nyx: watch registry, restart dead workers, track health, trigger failover."""
    last_seen: dict[str, int] = {}
    failure_counts: dict[str, int] = {}  # consecutive failures per profile
    cycle_count = 0
    path = Path(registry_path)
    socket_path = os.environ.get("IRIS_PROFILE_RESTART_SOCKET", "/tmp/iris-profile-restart.sock")

    # Health state file for UI consumption
    health_path = Path.home() / ".hermes" / "iris_health.json"

    while True:
        try:
            cycle_count += 1

            if not path.exists():
                time.sleep(3.0)
                continue

            data = json.loads(path.read_text())
            runtimes = data.get("runtimes", {})
            health_state = {}

            for profile, status in runtimes.items():
                if profile == "nyx":
                    continue
                pid = status.get("pid")
                alive = bool(pid and _pid_alive(pid))

                if alive:
                    last_seen[profile] = pid
                    failure_counts[profile] = 0
                    health_state[profile] = {"alive": True, "pid": pid, "failures": 0}
                else:
                    failures = failure_counts.get(profile, 0) + 1
                    failure_counts[profile] = failures
                    health_state[profile] = {"alive": False, "pid": pid, "failures": failures}

                    if pid and last_seen.get(profile) != pid:
                        print(f"[nyx] Restarting dead worker: {profile} (pid={pid}, failures={failures})")
                        _post_restart_request(socket_path, profile)
                        last_seen[profile] = pid

                    # Model failover after 3 consecutive failures
                    if failures >= 3 and failures % 3 == 0:
                        print(f"[nyx] Profile {profile} has {failures} consecutive failures — triggering restart")
                        _post_restart_request(socket_path, profile)

            # Write health state for UI
            try:
                health_path.write_text(json.dumps({
                    "updated_at": time.time(),
                    "cycle": cycle_count,
                    "profiles": health_state,
                }, default=str))
            except Exception:
                pass

            time.sleep(5.0)
        except Exception:
            time.sleep(5.0)


def _post_restart_request(socket_path: str, profile: str) -> None:
    body = json.dumps({"profile": profile}).encode("utf-8")
    conn = http.client.HTTPConnection("localhost")
    conn.sock = _UnixSocketWrapper(socket_path)
    try:
        conn.request("POST", "/restart-profile", body=body, headers={"Content-Type": "application/json"})
        conn.getresponse().read()
    except Exception:
        pass
    finally:
        try:
            conn.close()
        except Exception:
            pass


class _UnixSocketWrapper:
    def __init__(self, socket_path: str):
        import socket
        self.socket_path = socket_path
        self._sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self._sock.settimeout(5.0)
        self._sock.connect(socket_path)

    def sendall(self, data):
        self._sock.sendall(data)

    def makefile(self, mode, buffering=None):
        return self._sock.makefile(mode, buffering)

    def close(self):
        self._sock.close()


def _pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False