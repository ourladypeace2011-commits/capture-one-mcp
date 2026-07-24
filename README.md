# Capture One MCP

AppleScript-backed MCP server for Capture One on macOS.

This server uses Capture One's installed scripting dictionary (`CaptureOne.sdef`), not screen scraping. By default the server expects Capture One at `/Applications/Capture One.app`; override with `CAPTURE_ONE_APP` if needed.

## Scope

Capture One MCP is a dedicated MCP control surface for Capture One. It focuses on automation primitives: reading the active Capture One context, reading/writing supported adjustment fields, locating preview cache files, and enabling vision-assisted analysis workflows.

It does **not** try to replace a photographer/retoucher, guarantee exact style matching, or ship a one-click grading bot. See [`docs/automation-scope.md`](docs/automation-scope.md) for the project boundary.

## Tools

Read-only by default:

- `capture_one_status` — install/running status, app version, current document, selected count
- `capture_one_selected_variants` — selected variants as TSV
- `capture_one_list_recipes` — process recipes as TSV
- `capture_one_adjustment_fields` — list supported adjustment fields
- `capture_one_get_selected_adjustments` — read tone/color adjustment values from selected variants
- `capture_one_get_selected_curves` — read tone-curve points (rgb/luma/red/green/blue) as TSV
- `capture_one_get_selected_layers` — list adjustment layers (index, name, kind, enabled, opacity, luma range) as TSV
- `capture_one_find_selected_preview_cache` — locate internal Capture One preview/thumbnail cache files for selected variants
- `capture_one_convert_selected_preview_cache` — convert internal preview cache to temporary JPEGs for vision analysis, without Capture One export

Write/export tools are locked unless started with `CAPTURE_ONE_MCP_ALLOW_WRITE=1`:

- `capture_one_set_selected_adjustments` — generic selected-variant adjustment writer
- `capture_one_set_selected_curve` — replace the points of one tone curve
- `capture_one_set_selected_layer` — set a layer's name/enabled/opacity/luma-range mask
- `capture_one_set_selected_layer_adjustments` — set adjustment fields on one layer (local adjustments)
- `capture_one_layer_mask` — run a mask command (clear/invert/fill/rasterize/feather/refine) on a layer
- `capture_one_set_selected_rating`
- `capture_one_process_selected`
- `capture_one_capture`

## Adjustment coverage

The server exposes 83 directly writable scalar/text/boolean adjustment fields from Capture One's AppleScript dictionary (white balance, exposure, contrast, saturation, color balance, levels, highlight/shadow recovery, clarity, dehaze amount, vignette, sharpening, noise reduction, film grain, moire), plus dedicated tools for two nested-object families:

- **Tone curves** — `rgb`/`luma`/`red`/`green`/`blue`, as ordered `{brightness (x, 0-100), amount (y, 0-100)}` points.
- **Layers / masks / local adjustments** — enumerate/modify layers, apply the same adjustment fields per-layer, and run mask commands (feather/refine take an amount).

The **Color Editor** is not exposed: the sdef `color editor options` class declares no scriptable properties or elements, so it is not addressable via AppleScript in this Capture One version. RGB-color object fields (e.g. dehaze color) also still need coercion helpers. Catalog thumbnail (`.cot`) lookup by numeric id is deferred — the high-res `.cop` proxy is already resolved by filename and is the better vision source anyway.

## Preview cache notes

Capture One can maintain per-image internal cache folders such as:

```text
<image folder>/CaptureOne/Cache/Proxies/<raw filename>.cop
<image folder>/CaptureOne/Cache/Proxies/<raw filename>.cof
<image folder>/CaptureOne/Cache/Thumbnails/<raw filename>.[uuid].cot
```

On the checked local sample, `.cop` is a JPEG XL container readable by macOS `sips`, `.cot` is JPEG, and `.cof` is a grayscale JPEG focus/preview sidecar. `capture_one_convert_selected_preview_cache` uses `sips` to create temporary JPEGs for vision models; it does not ask Capture One to export/process the image.

Session/catalog/folder-browser storage can differ, so cache lookup checks the selected image folder plus current-document path/folder candidates. Real catalog packages still need a live catalog sample to harden lookup rules.

## Install / build

```bash
npm install
npm run build
```

## Run

```bash
node dist/index.js
```

Enable mutating tools only when you want the model to change Capture One state:

```bash
CAPTURE_ONE_MCP_ALLOW_WRITE=1 node dist/index.js
```

## MCP client config example

```json
{
  "mcpServers": {
    "capture-one": {
      "command": "node",
      "args": ["/absolute/path/to/capture-one-mcp/dist/index.js"],
      "env": {
        "CAPTURE_ONE_MCP_ALLOW_WRITE": "0"
      }
    }
  }
}
```

For export/capture/rating changes, set `CAPTURE_ONE_MCP_ALLOW_WRITE` to `1`.

## License

MIT.

This project is not affiliated with, endorsed by, or sponsored by Capture One. Capture One is a trademark of its respective owner.
