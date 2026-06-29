package com.pdfdiff.service;

import com.pdfdiff.domain.LineUnit;
import com.pdfdiff.domain.RawChange;
import com.pdfdiff.dto.ChangeItem;
import com.pdfdiff.dto.CompareResult;
import com.pdfdiff.dto.CompareSummary;
import com.pdfdiff.dto.LineInfo;
import com.pdfdiff.dto.SideInfo;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class ResultMapper {

    public CompareResult buildCompareResult(
            String jobId,
            List<LineUnit> templateLines,
            List<LineUnit> contractLines,
            List<RawChange> rawChanges
    ) {
        List<ChangeItem> changes = new ArrayList<>();
        CompareSummary summary = new CompareSummary();
        int changeIndex = 0;

        for (RawChange raw : rawChanges) {
            if ("equal".equals(raw.type())) {
                summary = new CompareSummary(
                        summary.deletedLines(),
                        summary.insertedLines(),
                        summary.modifiedLines(),
                        summary.equalLines() + 1
                );
                continue;
            }

            changeIndex++;
            ChangeItem item = toChangeItem(String.format("c%04d", changeIndex), raw);
            changes.add(item);
            summary = updateSummary(summary, item);
        }

        return new CompareResult(
                jobId,
                summary,
                changes,
                templateLines.stream().map(this::toLineInfo).toList(),
                contractLines.stream().map(this::toLineInfo).toList()
        );
    }

    private ChangeItem toChangeItem(String changeId, RawChange raw) {
        return new ChangeItem(
                changeId,
                raw.type(),
                sideFromLines(raw.templateLines()),
                sideFromLines(raw.contractLines())
        );
    }

    private SideInfo sideFromLines(List<LineUnit> lines) {
        if (lines == null || lines.isEmpty()) {
            return null;
        }
        LineUnit line = lines.get(0);
        double[] bbox = line.bbox();
        return new SideInfo(
                line.page(),
                line.text(),
                List.of(List.of(bbox[0], bbox[1], bbox[2], bbox[3]))
        );
    }

    private LineInfo toLineInfo(LineUnit line) {
        double[] bbox = line.bbox();
        return new LineInfo(
                line.id(),
                line.page(),
                line.text(),
                List.of(List.of(bbox[0], bbox[1], bbox[2], bbox[3]))
        );
    }

    private CompareSummary updateSummary(CompareSummary summary, ChangeItem item) {
        return switch (item.type()) {
            case "delete" -> new CompareSummary(
                    summary.deletedLines() + 1,
                    summary.insertedLines(),
                    summary.modifiedLines(),
                    summary.equalLines()
            );
            case "insert" -> new CompareSummary(
                    summary.deletedLines(),
                    summary.insertedLines() + 1,
                    summary.modifiedLines(),
                    summary.equalLines()
            );
            case "replace" -> new CompareSummary(
                    summary.deletedLines(),
                    summary.insertedLines(),
                    summary.modifiedLines() + 1,
                    summary.equalLines()
            );
            default -> summary;
        };
    }
}
