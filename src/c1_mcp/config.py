from pathlib import Path
from c1_mcp.models import BaseModel, Field
import os

class Settings(BaseModel):
    app_path: Path = Field(default=Path("/Applications/Capture One.app"))
    process_name: str = "Capture One"
    timeout_ms: int = 15_000
    preview_dir: Path = Path("/tmp/c1-mcp/previews")
    log_dir: Path = Path("/tmp/c1-mcp/logs")
    allow_write: bool = False

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            app_path=Path(os.getenv("CAPTURE_ONE_APP", "/Applications/Capture One.app")),
            process_name=os.getenv("CAPTURE_ONE_PROCESS", "Capture One"),
            timeout_ms=int(os.getenv("CAPTURE_ONE_MCP_TIMEOUT_MS", "15000")),
            preview_dir=Path(os.getenv("C1_MCP_PREVIEW_DIR", "/tmp/c1-mcp/previews")),
            log_dir=Path(os.getenv("C1_MCP_LOG_DIR", "/tmp/c1-mcp/logs")),
            allow_write=os.getenv("CAPTURE_ONE_MCP_ALLOW_WRITE") == "1",
        )
