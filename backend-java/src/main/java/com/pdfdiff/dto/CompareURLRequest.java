package com.pdfdiff.dto;

public record CompareURLRequest(
        String templateUrl,
        String contractUrl,
        String templateName,
        String contractName,
        CompareOptions options
) {
    public CompareURLRequest {
        if (options == null) {
            options = new CompareOptions();
        }
        if (templateName == null) {
            templateName = "";
        }
        if (contractName == null) {
            contractName = "";
        }
    }
}
