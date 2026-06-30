from pathlib import Path
from uuid import uuid4
from datetime import datetime, timezone
import json

def record_operation(log_dir: Path, payload: dict) -> str:
    log_dir.mkdir(parents=True, exist_ok=True)
    operation_id = str(uuid4())
    record = {"operation_id": operation_id, "created_at": datetime.now(timezone.utc).isoformat(), **payload}
    (log_dir / f"{operation_id}.json").write_text(json.dumps(record, indent=2), encoding="utf-8")
    return operation_id
