import json
from pathlib import Path

PERMISSIONS_FILE = Path.home() / ".hermes" / "iris_permissions.json"

DEFAULT_PERMISSIONS = {
    "computer_use": "ask",
    "browser_control": "allowed",
    "file_system": "allowed",
    "terminal": "allowed",
    "network": "allowed",
    "memory_write": "allowed",
    "delegation": "allowed",
}

TOOL_PERMISSION_MAP = {
    "mcp_mcp_computer_use_computer": "computer_use",
    "mcp_computer_use": "computer_use",
    "computer_use": "computer_use",
    "mcp_browser_navigate": "browser_control",
    "mcp_browser_click": "browser_control",
    "mcp_browser_type": "browser_control",
    "mcp_browser_snapshot": "browser_control",
    "browser_navigate": "browser_control",
    "browser_click": "browser_control",
    "mcp_terminal": "terminal",
    "terminal": "terminal",
    "execute_code": "terminal",
    "mcp_write_file": "file_system",
    "mcp_patch": "file_system",
    "write_file": "file_system",
    "patch": "file_system",
    "memory": "memory_write",
    "delegate_task": "delegation",
}

def load_permissions() -> dict:
    try:
        if PERMISSIONS_FILE.exists():
            data = json.loads(PERMISSIONS_FILE.read_text())
            return {**DEFAULT_PERMISSIONS, **data}
    except Exception:
        pass
    return dict(DEFAULT_PERMISSIONS)

def save_permissions(perms: dict):
    PERMISSIONS_FILE.parent.mkdir(parents=True, exist_ok=True)
    PERMISSIONS_FILE.write_text(json.dumps(perms, indent=2))

def get_permission_for_tool(tool_name: str) -> str:
    """Returns 'allowed', 'ask', or 'denied' for a given tool name."""
    perms = load_permissions()
    # Check direct match first, then prefix match
    category = TOOL_PERMISSION_MAP.get(tool_name)
    if not category:
        # Try prefix matching
        for prefix, cat in TOOL_PERMISSION_MAP.items():
            if tool_name.startswith(prefix) or prefix.startswith(tool_name):
                category = cat
                break
    if not category:
        return "allowed"  # Unknown tools default to allowed
    return perms.get(category, "allowed")
