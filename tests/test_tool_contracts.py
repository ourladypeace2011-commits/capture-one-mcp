from c1_mcp.services.captureone_service import CaptureOneService


def test_adjustment_fields_structured():
    result = CaptureOneService().list_adjustment_fields()
    assert result["count"] > 0
    assert all("name" in f and "type" in f for f in result["fields"])


def test_unsupported_adjustment_field_structured_error():
    result = CaptureOneService().get_selected_adjustments(["arbitrary script"])
    assert result["error"]["code"] == "unsupported_field"


def test_selected_variants_returns_structured_error():
    result = CaptureOneService().get_selected_variants()
    assert result.variants == []
    assert result.error.code == "capture_one_not_running"
