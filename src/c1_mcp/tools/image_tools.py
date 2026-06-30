from c1_mcp.services.image_analysis_service import ImageAnalysisService
svc = ImageAnalysisService()

def register(mcp):
    mcp.tool(name="image.detect_background", annotations={"readOnlyHint": True})(svc.detect_background)
    mcp.tool(name="image.analyze_luminance", annotations={"readOnlyHint": True})(svc.analyze_luminance)
    mcp.tool(name="image.detect_color_cast", annotations={"readOnlyHint": True})(svc.detect_color_cast)
    mcp.tool(name="image.compare_to_reference", annotations={"readOnlyHint": True})(svc.compare_to_reference)
