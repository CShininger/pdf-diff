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

    public static RawChange delete(LineUnit line, List<double[]> bboxes) {
        return new RawChange("delete", "char", List.of(line), List.of(), bboxes, null);
    }

    public static RawChange insert(LineUnit line, List<double[]> bboxes) {
        return new RawChange("insert", "char", List.of(), List.of(line), null, bboxes);
    }

    public static RawChange insertWithAnchor(
            LineUnit templateAnchor,
            List<double[]> templateBboxes,
            LineUnit contractLine,
            List<double[]> contractBboxes
    ) {
        return new RawChange(
                "insert",
                "char",
                templateAnchor == null ? List.of() : List.of(templateAnchor),
                List.of(contractLine),
                templateBboxes,
                contractBboxes
        );
    }

    public static RawChange replace(
            LineUnit templateLine,
            LineUnit contractLine,
            List<double[]> templateBboxes,
            List<double[]> contractBboxes
    ) {
        return new RawChange(
                "replace",
                "char",
                List.of(templateLine),
                List.of(contractLine),
                templateBboxes,
                contractBboxes
        );
    }
}
