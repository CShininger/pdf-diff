package com.pdfdiff.dto;

public record HistoryDetail(
        long id,
        String jobId,
        String backend,
        String templateUrl,
        String contractUrl,
        String templateName,
        String contractName,
        CompareSummary summary,
        String createdAt,
        CompareResult result
) {}
