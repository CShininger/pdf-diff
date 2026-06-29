package com.pdfdiff.vo;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record CompareResponse(
        String jobId,
        String status,
        CompareResult result,
        String message
) {
    public static CompareResponse done(String jobId, CompareResult result) {
        return new CompareResponse(jobId, "done", result, null);
    }
}
