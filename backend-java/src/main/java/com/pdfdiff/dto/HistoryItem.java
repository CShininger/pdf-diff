package com.pdfdiff.dto;

public record HistoryItem(
        long id,
        String jobId,
        String backend,
        String templateUrl,
        String contractUrl,
        String templateName,
        String contractName,
        CompareSummary summary,
        String createdAt
) {}
