package com.pdfdiff.service.impl;

import com.pdfdiff.model.CharBBox;
import com.pdfdiff.model.LineUnit;
import com.pdfdiff.model.RawChange;
import com.pdfdiff.service.DiffEngine;
import com.pdfdiff.util.SequenceMatcher;
import com.pdfdiff.util.SequenceMatcher.Opcode;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
public class DiffEngineImpl implements DiffEngine {

    @Override
    public List<RawChange> diffLines(List<LineUnit> templateLines, List<LineUnit> contractLines) {
        List<Segment> tplSegments = splitSegments(templateLines);
        List<Segment> conSegments = splitSegments(contractLines);

        if (segmentsAlignable(tplSegments, conSegments)) {
            List<RawChange> changes = new ArrayList<>();
            for (int i = 0; i < tplSegments.size(); i++) {
                List<LineUnit> tplChunk = tplSegments.get(i).lines();
                List<LineUnit> conChunk = conSegments.get(i).lines();
                if (!tplChunk.isEmpty() && !tplChunk.get(0).normalized().isEmpty()) {
                    changes.addAll(diffLineSequence(tplChunk, conChunk));
                } else {
                    changes.addAll(diffEmptyRun(tplChunk, conChunk));
                }
            }
            return changes;
        }

        return diffLineSequence(templateLines, contractLines);
    }

    private boolean segmentsAlignable(List<Segment> tplSegments, List<Segment> conSegments) {
        if (tplSegments.size() != conSegments.size() || tplSegments.size() <= 1) {
            return false;
        }
        for (int i = 0; i < tplSegments.size(); i++) {
            if (!tplSegments.get(i).kind().equals(conSegments.get(i).kind())) {
                return false;
            }
        }
        return true;
    }

    private List<Segment> splitSegments(List<LineUnit> lines) {
        List<Segment> segments = new ArrayList<>();
        int index = 0;

        while (index < lines.size()) {
            if (lines.get(index).normalized().isEmpty()) {
                int start = index;
                while (index < lines.size() && lines.get(index).normalized().isEmpty()) {
                    index++;
                }
                segments.add(new Segment("empty", lines.subList(start, index)));
            } else {
                int start = index;
                index++;
                while (index < lines.size()) {
                    if (lines.get(index).normalized().isEmpty()) {
                        break;
                    }
                    if (isParagraphBreak(lines.get(index - 1), lines.get(index))) {
                        break;
                    }
                    index++;
                }
                segments.add(new Segment("content", lines.subList(start, index)));
            }
        }
        return segments;
    }

    private boolean isParagraphBreak(LineUnit prev, LineUnit curr) {
        if (prev.page() != curr.page()) {
            return true;
        }
        double prevHeight = Math.max(prev.bbox()[3] - prev.bbox()[1], 1.0);
        double gap = curr.bbox()[1] - prev.bbox()[3];
        return gap > prevHeight * 0.75;
    }

    private List<RawChange> diffLineSequence(List<LineUnit> tpl, List<LineUnit> con) {
        if (tpl.isEmpty() && con.isEmpty()) {
            return List.of();
        }

        List<String> tplNormalized = tpl.stream().map(LineUnit::normalized).toList();
        List<String> conNormalized = con.stream().map(LineUnit::normalized).toList();
        List<RawChange> changes = new ArrayList<>();

        for (Opcode opcode : SequenceMatcher.getOpcodes(tplNormalized, conNormalized)) {
            switch (opcode.tag()) {
                case "equal" -> {
                }
                case "delete" -> changes.addAll(deleteLines(tpl.subList(opcode.i1(), opcode.i2())));
                case "insert" -> changes.addAll(insertLines(con.subList(opcode.j1(), opcode.j2())));
                case "replace" -> changes.addAll(diffReplaceBlock(
                        tpl.subList(opcode.i1(), opcode.i2()),
                        con.subList(opcode.j1(), opcode.j2())
                ));
                default -> {
                }
            }
        }
        return changes;
    }

    private List<RawChange> diffReplaceBlock(List<LineUnit> tpl, List<LineUnit> con) {
        if (tpl.size() == con.size()) {
            List<RawChange> changes = new ArrayList<>();
            for (int i = 0; i < tpl.size(); i++) {
                if (tpl.get(i).normalized().equals(con.get(i).normalized())) {
                    continue;
                }
                RawChange pair = diffLinePair(tpl.get(i), con.get(i));
                if (pair != null) {
                    changes.add(pair);
                }
            }
            return changes;
        }

        if (tpl.size() == 1 && con.size() == 1) {
            RawChange pair = diffLinePair(tpl.get(0), con.get(0));
            return pair != null ? List.of(pair) : List.of();
        }

        List<RawChange> changes = new ArrayList<>();
        for (Opcode opcode : SequenceMatcher.getOpcodes(
                tpl.stream().map(LineUnit::normalized).toList(),
                con.stream().map(LineUnit::normalized).toList()
        )) {
            switch (opcode.tag()) {
                case "equal" -> {
                }
                case "delete" -> changes.addAll(deleteLines(tpl.subList(opcode.i1(), opcode.i2())));
                case "insert" -> changes.addAll(insertLines(con.subList(opcode.j1(), opcode.j2())));
                case "replace" -> changes.addAll(pairReplaceLines(
                        tpl.subList(opcode.i1(), opcode.i2()),
                        con.subList(opcode.j1(), opcode.j2())
                ));
                default -> {
                }
            }
        }
        return changes;
    }

    private List<RawChange> pairReplaceLines(List<LineUnit> tpl, List<LineUnit> con) {
        List<RawChange> changes = new ArrayList<>();
        int pairCount = Math.min(tpl.size(), con.size());

        for (int idx = 0; idx < pairCount; idx++) {
            if (tpl.get(idx).normalized().equals(con.get(idx).normalized())) {
                continue;
            }
            RawChange pair = diffLinePair(tpl.get(idx), con.get(idx));
            if (pair != null) {
                changes.add(pair);
            }
        }

        changes.addAll(deleteLines(tpl.subList(pairCount, tpl.size())));
        changes.addAll(insertLines(con.subList(pairCount, con.size())));
        return changes;
    }

    private RawChange diffLinePair(LineUnit tplLine, LineUnit conLine) {
        if (tplLine.text().equals(conLine.text())) {
            return null;
        }
        List<double[]> tplBboxes = charDiffBboxes(tplLine, conLine.text());
        List<double[]> conBboxes = charDiffBboxes(conLine, tplLine.text());
        return RawChange.replace(tplLine, conLine, tplBboxes, conBboxes);
    }

    private List<double[]> charDiffBboxes(LineUnit line, String otherText) {
        if (line.text().equals(otherText)) {
            return List.of();
        }

        List<int[]> ranges = new ArrayList<>();
        for (Opcode opcode : SequenceMatcher.getOpcodes(
                SequenceMatcher.toCharTokens(line.text()),
                SequenceMatcher.toCharTokens(otherText)
        )) {
            if ("delete".equals(opcode.tag()) || "replace".equals(opcode.tag())) {
                ranges.add(new int[]{opcode.i1(), opcode.i2()});
            }
        }
        return bboxesForRanges(line, ranges);
    }

    private List<double[]> bboxesForRanges(LineUnit line, List<int[]> ranges) {
        if (ranges.isEmpty()) {
            return List.of();
        }
        if (line.charBboxes().isEmpty()) {
            return List.of(line.bbox());
        }

        List<double[]> bboxes = new ArrayList<>();
        for (int[] range : ranges) {
            int start = range[0];
            int end = range[1];
            if (start >= end) {
                continue;
            }
            for (CharBBox charBBox : line.charBboxes()) {
                if (charBBox.end() <= start || charBBox.start() >= end) {
                    continue;
                }
                bboxes.add(charBBox.bbox());
            }
        }

        if (bboxes.isEmpty()) {
            return List.of(line.bbox());
        }
        return mergeBboxes(bboxes);
    }

    private List<double[]> mergeBboxes(List<double[]> bboxes) {
        if (bboxes.isEmpty()) {
            return List.of();
        }

        List<double[]> sorted = new ArrayList<>(bboxes);
        sorted.sort(Comparator
                .comparingDouble((double[] box) -> box[1])
                .thenComparingDouble(box -> box[0]));

        List<double[]> merged = new ArrayList<>();
        merged.add(sorted.get(0).clone());

        for (int i = 1; i < sorted.size(); i++) {
            double[] box = sorted.get(i);
            double[] last = merged.get(merged.size() - 1);
            double lastHeight = Math.max(last[3] - last[1], box[3] - box[1]);
            boolean sameRow = Math.abs(box[1] - last[1]) < Math.max(lastHeight, 1.0) * 0.5;
            boolean touching = box[0] <= last[2] + 2;

            if (sameRow && touching) {
                last[0] = last[0];
                last[1] = Math.min(last[1], box[1]);
                last[2] = Math.max(last[2], box[2]);
                last[3] = Math.max(last[3], box[3]);
            } else {
                merged.add(box.clone());
            }
        }
        return merged;
    }

    private List<RawChange> diffEmptyRun(List<LineUnit> tpl, List<LineUnit> con) {
        int pairCount = Math.min(tpl.size(), con.size());
        List<RawChange> changes = new ArrayList<>();
        changes.addAll(deleteLines(tpl.subList(pairCount, tpl.size())));
        changes.addAll(insertLines(con.subList(pairCount, con.size())));
        return changes;
    }

    private List<RawChange> deleteLines(List<LineUnit> lines) {
        List<RawChange> changes = new ArrayList<>();
        for (LineUnit line : lines) {
            changes.add(RawChange.delete(line));
        }
        return changes;
    }

    private List<RawChange> insertLines(List<LineUnit> lines) {
        List<RawChange> changes = new ArrayList<>();
        for (LineUnit line : lines) {
            changes.add(RawChange.insert(line));
        }
        return changes;
    }

    private record Segment(String kind, List<LineUnit> lines) {
    }
}
