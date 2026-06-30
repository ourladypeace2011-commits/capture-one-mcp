from pathlib import Path
import subprocess
from typing import Protocol
from c1_mcp.config import Settings
from c1_mcp.models import (
    AdjustmentField,
    AdjustmentPlan,
    AdjustmentRecord,
    AppStateOutput,
    MutationResult,
    RecipeInfo,
    SelectedVariantsOutput,
    StructuredError,
    VariantInfo,
)
from c1_mcp.safety.limits import write_allowed
from c1_mcp.safety.operation_log import record_operation
from c1_mcp.services.applescript_runner import AppleScriptRunner

ADJUSTMENT_FIELDS = [
    AdjustmentField(name=n, type=t)
    for n, t in [
        ("orientation", "integer"),
        ("rotation", "real"),
        ("flip", "flip type"),
        ("color profile", "text"),
        ("film curve", "text"),
        ("white balance preset", "text"),
        ("temperature", "real"),
        ("tint", "real"),
        ("exposure", "real"),
        ("brightness", "real"),
        ("contrast", "real"),
        ("saturation", "real"),
        ("highlight recovery", "real"),
        ("shadow recovery", "real"),
        ("white recovery", "real"),
        ("black recovery", "real"),
        ("clarity amount", "real"),
        ("clarity structure", "real"),
        ("dehaze amount", "real"),
        ("vignetting amount", "real"),
        ("sharpening amount", "real"),
        ("noise reduction luminance", "real"),
        ("film grain impact", "real"),
    ]
]
DEFAULT_STYLE_FIELDS = [
    "color profile",
    "film curve",
    "white balance preset",
    "temperature",
    "tint",
    "exposure",
    "brightness",
    "contrast",
    "saturation",
    "highlight recovery",
    "shadow recovery",
    "white recovery",
    "black recovery",
]


class Runner(Protocol):
    def run_file(self, script_path: Path) -> str: ...


class CaptureOneService:
    def __init__(self, settings: Settings | None = None, runner: Runner | None = None):
        self.settings = settings or Settings.from_env()
        self.runner = runner or AppleScriptRunner(self.settings.timeout_ms)
        self.script_dir = Path(__file__).parents[1] / "applescript"

    def _script(self, name: str) -> Path:
        return self.script_dir / name

    def _running(self) -> bool:
        return subprocess.run(["pgrep", "-x", self.settings.process_name], capture_output=True).returncode == 0

    def _run_if_available(self, script_name: str) -> tuple[str | None, StructuredError | None]:
        if not self._running():
            return None, StructuredError(code="capture_one_not_running", message="Capture One is not running. Open it before calling this tool.")
        try:
            return self.runner.run_file(self._script(script_name)), None
        except Exception as exc:
            return None, StructuredError(code="osascript_failed", message=str(exc))

    @staticmethod
    def _split_tsv(raw: str) -> list[list[str]]:
        return [line.split("\t") for line in raw.splitlines() if line.strip()]

    @staticmethod
    def _parse_bool(value: str) -> bool | None:
        lowered = value.strip().lower()
        if lowered in {"true", "yes", "1"}:
            return True
        if lowered in {"false", "no", "0"}:
            return False
        return None

    def get_app_state(self) -> AppStateOutput:
        installed = self.settings.app_path.exists()
        result = AppStateOutput(installed=installed, app_path=str(self.settings.app_path), running=self._running())
        if not result.running:
            return result
        raw, error = self._run_if_available("get_app_state.applescript")
        if error:
            result.error = error
            return result
        for line in (raw or "").splitlines():
            key, _, value = line.partition("=")
            if key == "appVersion":
                result.app_version = value
            elif key == "currentDocument":
                result.current_document = value
            elif key == "selectedVariants":
                result.selected_variants = int(value or 0)
        return result

    def list_adjustment_fields(self) -> dict:
        return {
            "count": len(ADJUSTMENT_FIELDS),
            "fields": [f.model_dump() for f in ADJUSTMENT_FIELDS],
            "default_style_fields": DEFAULT_STYLE_FIELDS,
            "intentionally_excluded_for_now": ["curves", "color editor nested settings", "generic arbitrary writers"],
        }

    def get_selected_variants(self) -> SelectedVariantsOutput:
        raw, error = self._run_if_available("get_selected_variants.applescript")
        if error:
            return SelectedVariantsOutput(variants=[], error=error)
        rows = self._split_tsv(raw or "")
        variants: list[VariantInfo] = []
        for cols in rows[1:]:
            cols += [""] * (5 - len(cols))
            rating = int(cols[2]) if cols[2].isdigit() else None
            variants.append(VariantInfo(variant_id=cols[0], name=cols[1], rating=rating, color_tag=cols[3] or None, file_path=cols[4] or None))
        return SelectedVariantsOutput(variants=variants)

    def list_recipes(self) -> dict:
        raw, error = self._run_if_available("list_recipes.applescript")
        if error:
            return {"recipes": [], "error": error.model_dump()}
        recipes = []
        for cols in self._split_tsv(raw or "")[1:]:
            cols += [""] * (3 - len(cols))
            recipes.append(RecipeInfo(name=cols[0], enabled=self._parse_bool(cols[1]), output_format=cols[2] or None).model_dump())
        return {"recipes": recipes, "error": None}

    def get_selected_adjustments(self, fields: list[str] | None = None) -> dict:
        wanted = fields or DEFAULT_STYLE_FIELDS
        allowed = {f.name for f in ADJUSTMENT_FIELDS}
        bad = [f for f in wanted if f not in allowed]
        if bad:
            return {"adjustments": [], "error": StructuredError(code="unsupported_field", message=f"Unsupported Capture One adjustment field(s): {', '.join(bad)}").model_dump()}
        raw, error = self._run_if_available("get_selected_adjustments.applescript")
        if error:
            return {"adjustments": [], "fields": wanted, "error": error.model_dump()}
        records = []
        for cols in self._split_tsv(raw or "")[1:]:
            cols += [""] * (4 - len(cols))
            if cols[2] in wanted:
                records.append(AdjustmentRecord(variant_id=cols[0], variant_name=cols[1], field=cols[2], value=cols[3] or None).model_dump())
        return {"adjustments": records, "fields": wanted, "error": None}

    def apply_adjustments(self, plan: AdjustmentPlan, dry_run: bool = True, clone_only: bool = True) -> MutationResult:
        if dry_run:
            return MutationResult(message="Dry run: bounded adjustment plan validated; no Capture One changes applied.")
        if not write_allowed():
            return MutationResult(message="Write blocked.", error=StructuredError(code="write_disabled", message="Real writes require CAPTURE_ONE_MCP_ALLOW_WRITE=1."))
        op = record_operation(self.settings.log_dir, {"tool": "captureone.apply_adjustments", "plan": plan.model_dump(), "clone_only": clone_only})
        return MutationResult(planned=True, applied=False, dry_run=False, operation_id=op, message="AppleScript application is stubbed in this environment.", error=StructuredError(code="not_implemented", message="Real Capture One writes are isolated but not implemented in this phase."))

    def create_clone_variant(self, dry_run: bool = True) -> MutationResult:
        return MutationResult(message="Dry run: would create clone variant." if dry_run else "Clone variant requires Capture One runtime.", dry_run=dry_run, error=None if dry_run else StructuredError(code="not_implemented", message="Capture One clone AppleScript is not executable in this environment."))

    def export_before_after(self, dry_run: bool = True) -> MutationResult:
        return MutationResult(message="Dry run: would export before/after previews." if dry_run else "Export requires Capture One runtime.", dry_run=dry_run, error=None if dry_run else StructuredError(code="not_implemented", message="Before/after export is planned."))

    def rollback_last_change(self, dry_run: bool = True) -> MutationResult:
        return MutationResult(message="Dry run: would inspect operation log and rollback last change." if dry_run else "Rollback helper is planned.", dry_run=dry_run, error=None if dry_run else StructuredError(code="not_implemented", message="Rollback is planned."))
