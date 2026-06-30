def generate_batch_review(image_paths: list[str]) -> dict:
    return {"items": [{"image_path": p, "recommendation": "inspect_preview_first"} for p in image_paths], "summary": "Initial deterministic review; use luminance/color tools for metrics before edits."}
