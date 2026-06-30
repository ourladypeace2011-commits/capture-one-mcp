from pathlib import Path
from typing import Literal
try:
    from pydantic import BaseModel, Field, ConfigDict, ValidationError
except Exception:
    class ValidationError(ValueError): pass
    class FieldInfo:
        def __init__(self, default=None, ge=None, le=None): self.default=default; self.ge=ge; self.le=le
    def Field(default=None, ge=None, le=None, **kwargs): return FieldInfo(default, ge, le)
    def ConfigDict(**kwargs): return dict(kwargs)
    class BaseModel:
        model_config = {}
        def __init__(self, **data):
            import inspect
            anns = inspect.get_annotations(self.__class__, eval_str=False)
            if getattr(self, 'model_config', {}).get('extra') == 'forbid':
                extra = set(data) - set(anns)
                if extra: raise ValidationError(f'extra fields not permitted: {extra}')
            for name in anns:
                default = getattr(self.__class__, name, None)
                val = data.get(name, default.default if isinstance(default, FieldInfo) else default)
                if isinstance(default, FieldInfo):
                    if default.ge is not None and val < default.ge: raise ValidationError(f'{name} below minimum')
                    if default.le is not None and val > default.le: raise ValidationError(f'{name} above maximum')
                setattr(self, name, val)
        def model_dump(self):
            def dump(v):
                if isinstance(v, BaseModel): return v.model_dump()
                if isinstance(v, list): return [dump(x) for x in v]
                if isinstance(v, dict): return {k: dump(x) for k,x in v.items()}
                return v
            return {k: dump(v) for k,v in self.__dict__.items()}

class StructuredError(BaseModel):
    code: str
    message: str
    recoverable: bool = True

class VariantInfo(BaseModel):
    variant_id: str
    name: str
    rating: int | None = None
    color_tag: str | None = None
    file_path: str | None = None

class SelectedVariantsOutput(BaseModel):
    variants: list[VariantInfo]
    error: StructuredError | None = None

class AppStateOutput(BaseModel):
    installed: bool
    app_path: str
    bundle_version: str | None = None
    running: bool
    app_version: str | None = None
    current_document: str | None = None
    selected_variants: int | None = None
    error: StructuredError | None = None

class RecipeInfo(BaseModel):
    name: str
    enabled: bool | None = None
    output_format: str | None = None

class AdjustmentField(BaseModel):
    name: str
    type: str

class AdjustmentRecord(BaseModel):
    variant_id: str
    variant_name: str
    field: str
    value: str | None = None

class AdjustmentPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")
    exposure_delta: float = Field(0, ge=-0.25, le=0.25)
    contrast_delta: float = Field(0, ge=-8, le=8)
    brightness_delta: float = Field(0, ge=-8, le=8)
    saturation_delta: float = Field(0, ge=-5, le=5)
    kelvin_delta: int = Field(0, ge=-300, le=300)
    tint_delta: int = Field(0, ge=-3, le=3)

class MutationResult(BaseModel):
    planned: bool = True
    applied: bool = False
    dry_run: bool = True
    operation_id: str | None = None
    message: str
    error: StructuredError | None = None

class CacheFile(BaseModel):
    path: str
    exists: bool = True
    size: int | None = None
    mtime_ms: float | None = None
    kind: Literal["proxy", "thumbnail", "focus"]
    format: str

class VariantCacheInfo(BaseModel):
    variant_id: str
    name: str
    file_path: str
    image_base_name: str
    cache_roots_tried: list[str]
    proxy: CacheFile | None = None
    thumbnail: CacheFile | None = None
    focus: CacheFile | None = None
    error: StructuredError | None = None

class PreviewCacheOutput(BaseModel):
    document: dict[str, str]
    variants: list[VariantCacheInfo]

class ConvertedPreview(BaseModel):
    variant_id: str
    name: str
    file_path: str
    source_kind: str | None = None
    source_path: str | None = None
    output_path: str | None = None
    exists: bool = False
    size: int | None = None
    error: StructuredError | None = None

class LuminanceOutput(BaseModel):
    mean_luminance: float
    mean_rgb: tuple[int, int, int]
    background_target_rgb: tuple[int, int, int] | None = None
    background_delta_from_target: float | None = None
    highlight_clipping: bool
    shadow_clipping: bool
    status: str

class BackgroundOutput(BaseModel):
    mean_rgb: tuple[int, int, int]
    sample_method: str

class ColorCastOutput(BaseModel):
    mean_rgb: tuple[int, int, int]
    cast: str
    strength: float

class CompareOutput(BaseModel):
    image_mean_rgb: tuple[int, int, int]
    reference_mean_rgb: tuple[int, int, int]
    delta: float
    status: str
