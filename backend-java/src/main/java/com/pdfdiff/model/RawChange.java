package com.pdfdiff.model;

import java.util.List;

public record RawChange(
        String type,
        String level,
        List<LineUnit> templateLines,
        List<LineUnit> contractLines,
        List<double[]> templateBboxes,
        List<double[]> contractBboxes
) {
    public RawChange {
        templateLines = templateLines == null ? List.of() : List.copyOf(templateLines);
        contractLines = contractLines == null ? List.of() : List.copyOf(contractLines);
    }

    public static RawChange delete(LineUnit line) {
        return new RawChange("delete", "line", List.of(line), List.of(), null, null);
    }

    public static RawChange insert(LineUnit line) {
        return new RawChange("insert", "line", List.of(), List.of(line), null, null);
    }

    public static RawChange replace(
            LineUnit templateLine,
            LineUnit contractLine,
            List<double[]> templateBboxes,
            List<double[]> contractBboxes
    ) {
        return new RawChange(
                "replace",
                "line",
                List.of(templateLine),
                List.of(contractLine),
                templateBboxes,
                contractBboxes
        );
    }
}
