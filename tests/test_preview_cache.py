from c1_mcp.services.preview_cache_service import PreviewCacheService


def test_cache_roots_include_expected_candidates(tmp_path):
    svc = PreviewCacheService()
    image = tmp_path / "shoot" / "IMG.IIQ"
    roots = svc.cache_roots_for_variant(str(tmp_path / "session.cosessiondb"), str(tmp_path), str(image))
    text = [str(p) for p in roots]
    assert str((image.parent / "CaptureOne" / "Cache").resolve()) in text
    assert str((tmp_path / "CaptureOne" / "Cache").resolve()) in text


def test_find_cache_files(tmp_path):
    image = tmp_path / "shoot" / "IMG.IIQ"
    proxy_dir = image.parent / "CaptureOne" / "Cache" / "Proxies"
    thumb_dir = image.parent / "CaptureOne" / "Cache" / "Thumbnails"
    proxy_dir.mkdir(parents=True)
    thumb_dir.mkdir(parents=True)
    (proxy_dir / "IMG.IIQ.cop").write_bytes(b"x")
    (thumb_dir / "IMG.IIQ.abc.cot").write_bytes(b"y")
    result = PreviewCacheService().find_for_variant("", "", "v1", "IMG", str(image))
    assert result.proxy is not None
    assert result.thumbnail is not None
    assert result.focus is None
