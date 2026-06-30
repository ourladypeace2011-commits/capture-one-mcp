import os
from c1_mcp.models import StructuredError

WRITE_DISABLED = StructuredError(code="write_disabled", message="Real writes require CAPTURE_ONE_MCP_ALLOW_WRITE=1.")

def write_allowed() -> bool:
    return os.getenv("CAPTURE_ONE_MCP_ALLOW_WRITE") == "1"

def require_write_allowed() -> None:
    if not write_allowed():
        raise PermissionError(WRITE_DISABLED.message)
