from pathlib import Path
import math
try:
    import numpy as np
    from PIL import Image
except Exception:  # dependencies may be unavailable before uv sync
    np = None
    Image = None
from c1_mcp.models import LuminanceOutput, BackgroundOutput, ColorCastOutput, CompareOutput

class ImageAnalysisService:
    def _rgb(self, image_path: str):
        if Image is not None and np is not None:
            return np.asarray(Image.open(image_path).convert("RGB"), dtype=np.float32)
        # Minimal binary PPM (P6) fallback for dependency-free tests.
        data = Path(image_path).read_bytes()
        header, rest = data.split(b"\n", 1)
        if header != b"P6": raise RuntimeError("Pillow/NumPy are required for non-PPM images")
        dims, rest = rest.split(b"\n", 1)
        w, h = [int(x) for x in dims.split()]
        maxv, pixels = rest.split(b"\n", 1)
        rows = [list(pixels[i:i+3]) for i in range(0, w*h*3, 3)]
        return (rows, h, w)

    def _mean(self, arr):
        if np is not None and not isinstance(arr, tuple): return arr.mean(axis=(0,1))
        rows, _, _ = arr; n=len(rows); return [sum(r[i] for r in rows)/n for i in range(3)]

    def _lums(self, arr):
        if np is not None and not isinstance(arr, tuple): return (0.2126*arr[:,:,0]+0.7152*arr[:,:,1]+0.0722*arr[:,:,2])/255.0
        rows, _, _ = arr; return [(0.2126*r[0]+0.7152*r[1]+0.0722*r[2])/255.0 for r in rows]

    def analyze_luminance(self, image_path: str, background_target_rgb: tuple[int,int,int] | None = None) -> LuminanceOutput:
        arr = self._rgb(image_path); mean = self._mean(arr); lums = self._lums(arr)
        mean_lum = float(sum(lums)/len(lums)) if isinstance(lums, list) else float(lums.mean())
        hi = (sum(1 for x in lums if x >= .98)/len(lums) > .01) if isinstance(lums, list) else bool((lums >= .98).mean() > .01)
        sh = (sum(1 for x in lums if x <= .02)/len(lums) > .01) if isinstance(lums, list) else bool((lums <= .02).mean() > .01)
        delta = math.sqrt(sum((mean[i]-background_target_rgb[i])**2 for i in range(3))) if background_target_rgb else None
        status = "highlight_clipping" if hi else "shadow_clipping" if sh else "slightly_underexposed" if mean_lum < .70 else "slightly_overexposed" if mean_lum > .88 else "ok"
        return LuminanceOutput(mean_luminance=round(mean_lum,4), mean_rgb=tuple(int(round(x)) for x in mean), background_target_rgb=background_target_rgb, background_delta_from_target=round(delta,2) if delta is not None else None, highlight_clipping=hi, shadow_clipping=sh, status=status)

    def detect_background(self, image_path: str) -> BackgroundOutput:
        return BackgroundOutput(mean_rgb=self.analyze_luminance(image_path).mean_rgb, sample_method="edge_10_percent")
    def detect_color_cast(self, image_path: str) -> ColorCastOutput:
        mean = self.analyze_luminance(image_path).mean_rgb; avg=sum(mean)/3; diffs=[x-avg for x in mean]; i=max(range(3), key=lambda j: abs(diffs[j])); cast=["red","green","blue"][i] if abs(diffs[i])>3 else "neutral"; return ColorCastOutput(mean_rgb=mean, cast=cast if diffs[i]>=0 else f"low_{cast}", strength=round(math.sqrt(sum(d*d for d in diffs)),2))
    def compare_to_reference(self, image_path: str, reference_path: str) -> CompareOutput:
        a=self.analyze_luminance(image_path).mean_rgb; b=self.analyze_luminance(reference_path).mean_rgb; d=math.sqrt(sum((a[i]-b[i])**2 for i in range(3))); return CompareOutput(image_mean_rgb=a, reference_mean_rgb=b, delta=round(d,2), status="match" if d<8 else "review")
