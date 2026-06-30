from pathlib import Path
from c1_mcp.config import Settings
from c1_mcp.models import AdjustmentPlan, PreviewCacheOutput
from c1_mcp.services.captureone_service import CaptureOneService
from c1_mcp.services.preview_cache_service import PreviewCacheService

svc = CaptureOneService()
preview = PreviewCacheService()

def register(mcp):
    mcp.tool(name="captureone.get_app_state", annotations={"readOnlyHint": True})(svc.get_app_state)
    mcp.tool(name="captureone.get_selected_variants", annotations={"readOnlyHint": True})(svc.get_selected_variants)
    mcp.tool(name="captureone.list_recipes", annotations={"readOnlyHint": True})(svc.list_recipes)
    mcp.tool(name="captureone.list_adjustment_fields", annotations={"readOnlyHint": True})(svc.list_adjustment_fields)
    mcp.tool(name="captureone.get_selected_adjustments", annotations={"readOnlyHint": True})(svc.get_selected_adjustments)

    @mcp.tool(name="captureone.find_selected_preview_cache", annotations={"readOnlyHint": True})
    def find_selected_preview_cache() -> dict:
        selected = svc.get_selected_variants()
        if selected.error:
            return {"document": {}, "variants": [], "error": selected.error.model_dump()}
        variants = [preview.find_for_variant("", "", v.variant_id, v.name, v.file_path or "") for v in selected.variants]
        return PreviewCacheOutput(document={}, variants=variants).model_dump()

    @mcp.tool(name="captureone.convert_selected_preview_cache", annotations={"readOnlyHint": True})
    def convert_selected_preview_cache(prefer: str = "proxy", output_dir: str | None = None) -> dict:
        if prefer not in {"proxy", "thumbnail", "focus"}:
            return {"converted": [], "error": {"code": "invalid_preference", "message": "prefer must be proxy, thumbnail, or focus.", "recoverable": True}}
        selected = svc.get_selected_variants()
        if selected.error:
            return {"output_dir": str(output_dir or Settings.from_env().preview_dir), "converted": [], "error": selected.error.model_dump()}
        out = Path(output_dir) if output_dir else Settings.from_env().preview_dir
        converted = []
        for variant in selected.variants:
            cache = preview.find_for_variant("", "", variant.variant_id, variant.name, variant.file_path or "")
            converted.append(preview.convert(cache, prefer, out).model_dump())
        return {"output_dir": str(out), "converted": converted, "error": None}

    @mcp.tool(name="captureone.apply_adjustments", annotations={"destructiveHint": True})
    def apply_adjustments(plan: AdjustmentPlan, dry_run: bool = True, clone_only: bool = True):
        return svc.apply_adjustments(plan, dry_run=dry_run, clone_only=clone_only)

    mcp.tool(name="captureone.create_clone_variant", annotations={"destructiveHint": True})(svc.create_clone_variant)
    mcp.tool(name="captureone.export_before_after", annotations={"destructiveHint": True})(svc.export_before_after)
    mcp.tool(name="captureone.rollback_last_change", annotations={"destructiveHint": True})(svc.rollback_last_change)
