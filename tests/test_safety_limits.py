import pytest
from c1_mcp.models import AdjustmentPlan, ValidationError
from c1_mcp.services.captureone_service import CaptureOneService


def test_adjustment_plan_bounds():
    AdjustmentPlan(exposure_delta=0.25, contrast_delta=8)
    with pytest.raises(ValidationError):
        AdjustmentPlan(exposure_delta=0.5)
    with pytest.raises(ValidationError):
        AdjustmentPlan(foo=1)


def test_write_gating_blocks_real_write(monkeypatch):
    monkeypatch.delenv("CAPTURE_ONE_MCP_ALLOW_WRITE", raising=False)
    result = CaptureOneService().apply_adjustments(AdjustmentPlan(), dry_run=False)
    assert not result.applied
    assert result.error.code == "write_disabled"


def test_dry_run_default_safe(monkeypatch):
    monkeypatch.delenv("CAPTURE_ONE_MCP_ALLOW_WRITE", raising=False)
    result = CaptureOneService().apply_adjustments(AdjustmentPlan())
    assert result.dry_run is True
    assert result.error is None
