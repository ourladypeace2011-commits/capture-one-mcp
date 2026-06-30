from pathlib import Path
from hashlib import sha1
import subprocess
from c1_mcp.models import CacheFile, VariantCacheInfo, ConvertedPreview, StructuredError

class PreviewCacheService:
    def cache_roots_for_variant(self, document_path: str, document_folder: str, file_path: str) -> list[Path]:
        image_dir = Path(file_path).parent
        candidates = [
            image_dir / "CaptureOne" / "Cache",
            image_dir / ".." / "CaptureOne" / "Cache",
        ]
        if document_path:
            candidates += [Path(document_path) / "Cache", Path(document_path) / "CaptureOne" / "Cache"]
        if document_folder:
            candidates += [Path(document_folder) / "CaptureOne" / "Cache", Path(document_folder) / "Cache"]
        seen = []
        for c in candidates:
            r = c.resolve()
            if r not in seen:
                seen.append(r)
        return seen

    def _stat(self, path: Path) -> dict:
        try:
            st = path.stat()
            return {"exists": path.is_file(), "size": st.st_size, "mtime_ms": st.st_mtime * 1000}
        except FileNotFoundError:
            return {"exists": False}

    def _first(self, paths: list[Path]) -> Path | None:
        return next((p for p in paths if p.is_file()), None)

    def _thumbs(self, root: Path, base: str) -> list[Path]:
        d = root / "Thumbnails"
        return sorted(d.glob(f"{base}.*.cot")) if d.is_dir() else []

    def find_for_variant(self, document_path: str, document_folder: str, variant_id: str, name: str, file_path: str) -> VariantCacheInfo:
        base = Path(file_path).name
        roots = self.cache_roots_for_variant(document_path, document_folder, file_path)
        proxy = self._first([r / "Proxies" / f"{base}.cop" for r in roots])
        focus = self._first([r / "Proxies" / f"{base}.cof" for r in roots])
        thumb = self._first([p for r in roots for p in self._thumbs(r, base)])
        def cf(path: Path | None, kind: str, fmt: str):
            return CacheFile(path=str(path), kind=kind, format=fmt, **self._stat(path)) if path else None
        return VariantCacheInfo(variant_id=variant_id, name=name, file_path=file_path, image_base_name=base, cache_roots_tried=[str(r) for r in roots], proxy=cf(proxy,"proxy","JPEG XL container (.cop)"), focus=cf(focus,"focus","JPEG grayscale (.cof)"), thumbnail=cf(thumb,"thumbnail","JPEG (.cot)"))

    def convert(self, cache: VariantCacheInfo, prefer: str, output_dir: Path) -> ConvertedPreview:
        order = {"proxy":["proxy","thumbnail","focus"],"thumbnail":["thumbnail","proxy","focus"],"focus":["focus","proxy","thumbnail"]}[prefer]
        chosen_kind = next((k for k in order if getattr(cache, k)), None)
        if not chosen_kind:
            return ConvertedPreview(variant_id=cache.variant_id, name=cache.name, file_path=cache.file_path, error=StructuredError(code="cache_not_found", message="No Capture One cache preview found."))
        chosen = getattr(cache, chosen_kind)
        output_dir.mkdir(parents=True, exist_ok=True)
        digest = sha1(chosen.path.encode()).hexdigest()[:12]
        out = output_dir / f"{Path(cache.file_path).name}.{chosen_kind}.{digest}.jpg"
        try:
            subprocess.run(["sips", "-s", "format", "jpeg", chosen.path, "--out", str(out)], text=True, capture_output=True, timeout=30, check=True)
            st = out.stat()
            return ConvertedPreview(variant_id=cache.variant_id, name=cache.name, file_path=cache.file_path, source_kind=chosen_kind, source_path=chosen.path, output_path=str(out), exists=out.is_file(), size=st.st_size)
        except Exception as exc:
            return ConvertedPreview(variant_id=cache.variant_id, name=cache.name, file_path=cache.file_path, source_kind=chosen_kind, source_path=chosen.path, error=StructuredError(code="conversion_failed", message=str(exc)))
