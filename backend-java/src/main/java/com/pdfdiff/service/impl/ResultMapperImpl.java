package com.pdfdiff.service.impl;

import com.pdfdiff.model.LineUnit;
import com.pdfdiff.model.RawChange;
import com.pdfdiff.service.ResultMapper;
import com.pdfdiff.vo.ChangeItem;
import com.pdfdiff.vo.CompareResult;
import com.pdfdiff.vo.CompareSummary;
import com.pdfdiff.vo.LineInfo;
import com.pdfdiff.vo.SideInfo;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class ResultMapperImpl implements ResultMapper {

    @Override
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
                raw.level(),
                sideFromLines(raw.templateLines(), raw.templateBboxes()),
                sideFromLines(raw.contractLines(), raw.contractBboxes())
        );
    }

    private SideInfo sideFromLines(List<LineUnit> lines, List<double[]> bboxesOverride) {
        if (lines == null || lines.isEmpty()) {
            return null;
        }
        LineUnit line = lines.get(0);
        if (bboxesOverride == null || bboxesOverride.isEmpty()) {
            return null;
        }
        List<List<Double>> bboxes = bboxesOverride.stream()
                .map(box -> List.of(box[0], box[1], box[2], box[3]))
                .toList();
        return new SideInfo(line.page(), line.text(), bboxes);
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
