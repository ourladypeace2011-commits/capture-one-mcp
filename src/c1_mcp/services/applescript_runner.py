from pathlib import Path
import subprocess


class AppleScriptRunner:
    """Runs fixed, repository-owned AppleScript files.

    This class deliberately accepts only paths resolved by services. It does not
    expose a method that accepts arbitrary model-provided AppleScript source.
    """

    def __init__(self, timeout_ms: int = 15000):
        self.timeout_ms = timeout_ms

    def run_file(self, script_path: Path) -> str:
        completed = subprocess.run(
            ["osascript", str(script_path)],
            text=True,
            capture_output=True,
            timeout=self.timeout_ms / 1000,
            check=False,
        )
        if completed.returncode != 0:
            raise RuntimeError(completed.stderr.strip() or f"osascript exited with {completed.returncode}")
        return completed.stdout.strip()
