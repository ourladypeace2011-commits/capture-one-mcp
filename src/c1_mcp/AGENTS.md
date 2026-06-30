# AGENTS.md

## Python implementation rules

- `tools/` contains FastMCP tool definitions only.
- `services/` contains Capture One, AppleScript, preview cache, image analysis and report logic.
- `safety/` contains write gating, limits, operation logs and rollback helpers.
- AppleScript execution belongs only in `services/applescript_runner.py`.
- Capture One logic belongs in `services/captureone_service.py`.
- Preview cache logic belongs in `services/preview_cache_service.py`.
- Image metrics belong in `services/image_analysis_service.py`.
- Do not duplicate AppleScript snippets across tools.
- Never pass model-generated code to `osascript`.
- Validate field names against allowlists.
- Use structured Pydantic outputs instead of TSV/free text.
