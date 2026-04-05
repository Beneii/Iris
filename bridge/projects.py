"""
Iris Projects — persistent cross-session project contexts.

Each project groups sessions, assigns agents, and maintains shared memory.
Stored at ~/.hermes/iris_projects/{project_id}/
"""

import json
import time
import uuid
from pathlib import Path
from typing import Optional

PROJECTS_DIR = Path.home() / ".hermes" / "iris_projects"
PROJECTS_DIR.mkdir(parents=True, exist_ok=True)


def _project_dir(project_id: str) -> Path:
    return PROJECTS_DIR / project_id


def _load_project(project_id: str) -> Optional[dict]:
    meta = _project_dir(project_id) / "project.json"
    if meta.exists():
        return json.loads(meta.read_text())
    return None


def _save_project(project: dict):
    d = _project_dir(project["id"])
    d.mkdir(parents=True, exist_ok=True)
    meta_file = d / "project.json"
    tmp = meta_file.with_suffix(".tmp")
    tmp.write_text(json.dumps(project, indent=2, default=str))
    tmp.replace(meta_file)


def create_project(name: str, description: str = "", agents: list[str] = None) -> dict:
    project = {
        "id": f"proj-{uuid.uuid4().hex[:8]}",
        "name": name,
        "description": description,
        "created_at": time.time(),
        "updated_at": time.time(),
        "session_ids": [],
        "agent_ids": agents or ["hermes"],
        "tags": [],
        "status": "active",
    }
    d = _project_dir(project["id"])
    d.mkdir(parents=True, exist_ok=True)
    (d / "MEMORY.md").write_text(f"# {name}\n\nProject memory.\n")
    (d / "context.md").write_text(f"# Project: {name}\n\n{description}\n")
    _save_project(project)
    return project


def get_project(project_id: str) -> Optional[dict]:
    return _load_project(project_id)


def list_projects() -> list[dict]:
    projects = []
    if PROJECTS_DIR.exists():
        for d in sorted(PROJECTS_DIR.iterdir()):
            meta = d / "project.json"
            if meta.exists():
                try:
                    projects.append(json.loads(meta.read_text()))
                except Exception:
                    pass
    return projects


def update_project(project_id: str, **kwargs) -> Optional[dict]:
    project = _load_project(project_id)
    if not project:
        return None
    for key in ("name", "description", "agent_ids", "tags", "status"):
        if key in kwargs and kwargs[key] is not None:
            project[key] = kwargs[key]
    project["updated_at"] = time.time()
    # Update context.md if name/description changed
    if "name" in kwargs or "description" in kwargs:
        ctx = _project_dir(project_id) / "context.md"
        ctx.write_text(f"# Project: {project['name']}\n\n{project.get('description', '')}\n")
    _save_project(project)
    return project


def delete_project(project_id: str):
    import shutil
    d = _project_dir(project_id)
    if d.exists():
        shutil.rmtree(d)


def link_session(project_id: str, session_id: str) -> Optional[dict]:
    project = _load_project(project_id)
    if not project:
        return None
    if session_id not in project["session_ids"]:
        project["session_ids"].append(session_id)
        project["updated_at"] = time.time()
        _save_project(project)
    return project


def unlink_session(project_id: str, session_id: str) -> Optional[dict]:
    project = _load_project(project_id)
    if not project:
        return None
    if session_id in project["session_ids"]:
        project["session_ids"].remove(session_id)
        project["updated_at"] = time.time()
        _save_project(project)
    return project


def get_project_memory(project_id: str) -> str:
    mem = _project_dir(project_id) / "MEMORY.md"
    return mem.read_text() if mem.exists() else ""


def get_project_context(project_id: str) -> str:
    ctx = _project_dir(project_id) / "context.md"
    return ctx.read_text() if ctx.exists() else ""


def find_project_for_session(session_id: str) -> Optional[dict]:
    """Find a project that contains a given session."""
    for project in list_projects():
        if session_id in project.get("session_ids", []):
            return project
    return None
