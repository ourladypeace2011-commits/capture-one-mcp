# AGENTS.md

## Project

This is a local FastMCP server for controlling Capture One on macOS through safe AppleScript/JXA automation.

## Stack

- Python
- FastMCP
- Pydantic
- AppleScript/JXA via `osascript`
- Pillow / NumPy for initial image analysis
- pytest
- uv

The existing TypeScript implementation is legacy/reference until the Python FastMCP implementation reaches parity. Do not delete it during the migration.

## Core safety rules

- Never expose arbitrary AppleScript execution as an MCP tool.
- Mutating tools require `CAPTURE_ONE_MCP_ALLOW_WRITE=1` for real writes.
- Mutating tools default to `dry_run=True`.
- Never modify original variants by default.
- Prefer clone variants for edits.
- Use typed Pydantic models for inputs and outputs.
- Return structured errors.
- Tests must not require Capture One installed.
