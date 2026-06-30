# AGENTS.md

## Project

This repository implements a local FastMCP server for controlling Capture One on macOS through AppleScript/JXA.

The server must expose safe, typed MCP tools for Capture One automation, preview acquisition, image analysis, and reporting.

This is not a retouching bot and not a generic AppleScript execution server.

## Stack

- Python
- FastMCP
- Pydantic
- AppleScript/JXA via `osascript`
- Pillow / NumPy / OpenCV for image analysis
- pytest
- uv

The previous TypeScript implementation is legacy/reference until the Python FastMCP implementation reaches parity.

## Core rule

Never expose arbitrary AppleScript execution as an MCP tool.

Bad:

```text
captureone.run_applescript(script: str)
