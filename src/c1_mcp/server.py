from pathlib import Path
from fastmcp import FastMCP
from c1_mcp.tools import captureone_tools, image_tools, report_tools

mcp = FastMCP(name="Capture One MCP Bridge", strict_input_validation=True)

captureone_tools.register(mcp)
image_tools.register(mcp)
report_tools.register(mcp)

_RESOURCE_MAP = {
    "c1://rules/ecommerce-color": "ecommerce_color_rules.md",
    "c1://rules/editing-principles": "editing_principles.md",
    "c1://rules/human-review": "human_review_rules.md",
    "c1://docs/applescript-capabilities": "applescript_capabilities.md",
    "c1://docs/tool-contracts": "tool_contracts.md",
}
_RESOURCE_DIR = Path(__file__).parent / "resources"
def _make_resource_reader(filename: str):
    def read_resource() -> str:
        return (_RESOURCE_DIR / filename).read_text(encoding="utf-8")

    return read_resource


for uri, filename in _RESOURCE_MAP.items():
    mcp.resource(uri)(_make_resource_reader(filename))

@mcp.prompt(name="diagnose_ecommerce_image")
def diagnose_ecommerce_image() -> str:
    return "Inspect previews first, run luminance/background/color metrics, avoid destructive edits, and flag human review reasons."
@mcp.prompt(name="normalize_batch")
def normalize_batch() -> str:
    return "Review converted previews, compare metrics across the batch, use dry-run adjustment plans, and prefer clone variants."
@mcp.prompt(name="match_reference_color")
def match_reference_color() -> str:
    return "Compare target and reference metrics before edits; avoid aggressive correction and explain uncertainty."
@mcp.prompt(name="review_before_after")
def review_before_after() -> str:
    return "Evaluate before/after previews with metrics and call out clipping, color drift, or human-review concerns."

def main() -> None:
    mcp.run()

if __name__ == "__main__":
    main()
