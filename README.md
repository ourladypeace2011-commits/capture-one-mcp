# Capture One MCP

This repository is being migrated from a TypeScript proof of concept to a clean **FastMCP + Python** implementation for local Capture One automation on macOS.

The existing TypeScript implementation in `src/index.ts` remains available as legacy/reference during the migration. It must not be deleted until the Python implementation reaches parity.

## Architecture

The Python server exposes safe, typed MCP capabilities. It does **not** expose arbitrary AppleScript execution.

- FastMCP server: `src/c1_mcp/server.py`
- Tool definitions: `src/c1_mcp/tools/`
- Capture One, AppleScript, preview cache, image analysis, and reporting services: `src/c1_mcp/services/`
- Safety gates and operation logs: `src/c1_mcp/safety/`
- Fixed AppleScript snippets: `src/c1_mcp/applescript/`

## Safety model

Arbitrary AppleScript execution is intentionally not exposed. MCP clients receive bounded capabilities such as `captureone.get_app_state`, `captureone.find_selected_preview_cache`, and `image.analyze_luminance`, not a generic script runner.

Mutating tools are gated:

- `CAPTURE_ONE_MCP_ALLOW_WRITE=1` is required for real writes.
- Mutating tools default to `dry_run=true`.
- Original variants should not be modified by default.
- Clone variants are preferred.
- Adjustment deltas are bounded by Pydantic validation.

## Install with uv

```bash
uv sync
```

If dependencies need to be refreshed:

```bash
uv add fastmcp pydantic pillow numpy opencv-python scikit-image rich python-dotenv pytest
uv lock
```

## Run the FastMCP server

```bash
uv run fastmcp run src/c1_mcp/server.py:mcp
```

The default transport is stdio.

## MCP client config

```json
{
  "mcpServers": {
    "capture-one": {
      "command": "uv",
      "args": [
        "run",
        "fastmcp",
        "run",
        "src/c1_mcp/server.py:mcp"
      ],
      "env": {
        "CAPTURE_ONE_MCP_ALLOW_WRITE": "0",
        "C1_MCP_PREVIEW_DIR": "/tmp/c1-mcp/previews",
        "C1_MCP_LOG_DIR": "/tmp/c1-mcp/logs"
      }
    }
  }
}
```

## Read-only tools

- `captureone.get_app_state`
- `captureone.get_selected_variants`
- `captureone.list_recipes`
- `captureone.list_adjustment_fields`
- `captureone.get_selected_adjustments`
- `captureone.find_selected_preview_cache`
- `captureone.convert_selected_preview_cache`
- `image.detect_background`
- `image.analyze_luminance`
- `image.detect_color_cast`
- `image.compare_to_reference`
- `report.generate_batch_review`

## Write-gated tools

These tools default to dry run and require `CAPTURE_ONE_MCP_ALLOW_WRITE=1` for real writes:

- `captureone.create_clone_variant`
- `captureone.apply_adjustments`
- `captureone.export_before_after`
- `captureone.rollback_last_change`

Current write behavior is deliberately conservative; Capture One-specific real writes are isolated behind services and return structured not-implemented errors where they cannot be safely tested in this environment.

## Preview cache notes

The preview cache service preserves the TypeScript proof-of-concept lookup strategy. It checks likely Capture One cache roots near the selected image folder, sibling `CaptureOne/Cache` folders, document path candidates, and document folder candidates. It supports `.cop`, `.cot`, and `.cof` cache files and conversion through macOS `sips`.

## Tests

Tests do not require Capture One, macOS Automation permissions, real catalogs, real RAW files, or network access.

```bash
uv run pytest
```

## CI/CD

GitHub Actions workflows live in `.github/workflows/`:

- `ci.yml` runs Python tests on Python 3.11 and 3.12 with `uv`, compiles Python modules, smoke-imports the FastMCP server, and builds the legacy TypeScript reference with `npm run build`.
- `release.yml` runs tests on tag/manual dispatch and uploads a source-tree artifact for release review.

Both workflows set `CAPTURE_ONE_MCP_ALLOW_WRITE=0` and do not require Capture One, macOS Automation permissions, real catalogs, or RAW files.

## Legacy TypeScript reference

The TypeScript proof of concept uses `@modelcontextprotocol/sdk` directly and remains useful for migration source material, especially AppleScript snippets, adjustment field names, write gating, and preview-cache behavior.

## License

MIT.

This project is not affiliated with, endorsed by, or sponsored by Capture One. Capture One is a trademark of its respective owner.
