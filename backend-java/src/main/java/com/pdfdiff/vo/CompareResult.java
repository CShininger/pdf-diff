package com.pdfdiff.vo;

import java.util.List;

public record CompareResult(
        String jobId,
        String status,
        CompareSummary summary,
        List<ChangeItem> changes,
        List<LineInfo> templateLines,
        List<LineInfo> contractLines
) {
    public CompareResult(
            String jobId,
            CompareSummary summary,
            List<ChangeItem> changes,
            List<LineInfo> templateLines,
            List<LineInfo> contractLines
    ) {
        this(jobId, "done", summary, changes, templateLines, contractLines);
    }
}
