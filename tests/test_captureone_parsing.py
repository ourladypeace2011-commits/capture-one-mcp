from pathlib import Path
from c1_mcp.services.captureone_service import CaptureOneService


class FakeRunner:
    def __init__(self, outputs):
        self.outputs = outputs
        self.seen = []

    def run_file(self, script_path: Path) -> str:
        self.seen.append(script_path.name)
        return self.outputs[script_path.name]


def service(outputs, monkeypatch):
    svc = CaptureOneService(runner=FakeRunner(outputs))
    monkeypatch.setattr(svc, "_running", lambda: True)
    return svc


def test_parse_selected_variants_tsv(monkeypatch):
    svc = service({
        "get_selected_variants.applescript": "id\tname\trating\tcolor_tag\tfile\nabc\t261BR9072_10530_01.IIQ\t5\tgreen\t/path/file.IIQ"
    }, monkeypatch)
    result = svc.get_selected_variants()
    assert result.error is None
    assert result.variants[0].variant_id == "abc"
    assert result.variants[0].rating == 5
    assert result.variants[0].color_tag == "green"


def test_parse_recipes_tsv(monkeypatch):
    svc = service({"list_recipes.applescript": "name\tenabled\toutput_format\nWeb JPEG\ttrue\tJPEG"}, monkeypatch)
    result = svc.list_recipes()
    assert result["error"] is None
    assert result["recipes"][0]["name"] == "Web JPEG"
    assert result["recipes"][0]["enabled"] is True


def test_parse_selected_adjustments_filters_fields(monkeypatch):
    svc = service({
        "get_selected_adjustments.applescript": "variant_id\tvariant_name\tfield\tvalue\nabc\tImage\texposure\t0.15\nabc\tImage\tcontrast\t4"
    }, monkeypatch)
    result = svc.get_selected_adjustments(["exposure"])
    assert result["error"] is None
    assert result["adjustments"] == [{"variant_id": "abc", "variant_name": "Image", "field": "exposure", "value": "0.15"}]


def test_parse_app_state(monkeypatch):
    svc = service({"get_app_state.applescript": "appVersion=16.5\ncurrentDocument=Catalog\nselectedVariants=2"}, monkeypatch)
    result = svc.get_app_state()
    assert result.app_version == "16.5"
    assert result.current_document == "Catalog"
    assert result.selected_variants == 2
