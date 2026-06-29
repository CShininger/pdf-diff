package com.pdfdiff.domain;

import java.util.List;

public record RawChange(
        String type,
        String level,
        List<LineUnit> templateLines,
        List<LineUnit> contractLines
) {
    public static RawChange delete(LineUnit line) {
        return new RawChange("delete", "line", List.of(line), List.of());
    }

    public static RawChange insert(LineUnit line) {
        return new RawChange("insert", "line", List.of(), List.of(line));
    }
}
