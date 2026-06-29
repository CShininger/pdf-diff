package com.pdfdiff.dto;

public record CompareOptions(
        boolean ignoreWhitespace,
        boolean ignoreHeaderFooter
) {
    public CompareOptions() {
        this(true, true);
    }
}
