package com.pdfdiff.entity;

import java.time.LocalDateTime;

public record CompareHistory(
        Long id,
        String jobId,
        String backend,
        String templateUrl,
        String contractUrl,
        String templateName,
        String contractName,
        int deletedLines,
        int insertedLines,
        int modifiedLines,
        int equalLines,
        String resultJson,
        LocalDateTime createdAt
) {
}
