package com.pdfdiff.vo;

public record CompareSummary(
        int deletedLines,
        int insertedLines,
        int modifiedLines,
        int equalLines
) {
    public CompareSummary() {
        this(0, 0, 0, 0);
    }
}
