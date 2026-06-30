from c1_mcp.services.report_service import generate_batch_review

def register(mcp):
    mcp.tool(name="report.generate_batch_review", annotations={"readOnlyHint": True})(generate_batch_review)
