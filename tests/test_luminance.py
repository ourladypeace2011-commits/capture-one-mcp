from c1_mcp.services.image_analysis_service import ImageAnalysisService

def write_ppm(path, rgb, size=(20,20)):
    w,h=size
    path.write_bytes(b"P6\n%d %d\n255\n" % (w,h) + bytes(rgb) * w * h)

def test_luminance_on_synthetic_image(tmp_path):
    path = tmp_path / "gray.ppm"
    write_ppm(path, (240,240,240))
    result = ImageAnalysisService().analyze_luminance(str(path), (243, 243, 244))
    assert 0.9 < result.mean_luminance < 0.96
    assert result.mean_rgb == (240, 240, 240)
    assert result.background_delta_from_target is not None
    assert not result.shadow_clipping

def test_detect_background_edges(tmp_path):
    path = tmp_path / "edge.ppm"
    write_ppm(path, (243,243,244), (10,10))
    result = ImageAnalysisService().detect_background(str(path))
    assert result.mean_rgb == (243, 243, 244)
