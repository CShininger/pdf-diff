package com.pdfdiff.service;

import com.pdfdiff.domain.LineUnit;
import com.pdfdiff.domain.RawChange;
import com.pdfdiff.domain.Segment;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class DiffEngine {

    public List<RawChange> diffLines(List<LineUnit> templateLines, List<LineUnit> contractLines) {
        List<Segment> tplSegments = splitSegments(templateLines);
        List<Segment> conSegments = splitSegments(contractLines);

        List<List<LineUnit>> tplContent = tplSegments.stream()
                .filter(s -> "content".equals(s.kind()))
                .map(Segment::lines)
                .toList();
        List<List<LineUnit>> conContent = conSegments.stream()
                .filter(s -> "content".equals(s.kind()))
                .map(Segment::lines)
                .toList();
        List<List<LineUnit>> tplEmpty = tplSegments.stream()
                .filter(s -> "empty".equals(s.kind()))
                .map(Segment::lines)
                .toList();
        List<List<LineUnit>> conEmpty = conSegments.stream()
                .filter(s -> "empty".equals(s.kind()))
                .map(Segment::lines)
                .toList();

        if (tplContent.size() == conContent.size() && tplContent.size() >= 2) {
            List<RawChange> changes = new ArrayList<>();
            for (int i = 0; i < tplContent.size(); i++) {
                changes.addAll(diffContentSection(tplContent.get(i), conContent.get(i)));
            }
            int emptyPairs = Math.min(tplEmpty.size(), conEmpty.size());
            for (int i = 0; i < emptyPairs; i++) {
                changes.addAll(diffEmptyRun(tplEmpty.get(i), conEmpty.get(i)));
            }
            for (int i = conEmpty.size(); i < tplEmpty.size(); i++) {
                changes.addAll(deleteLines(tplEmpty.get(i)));
            }
            for (int i = tplEmpty.size(); i < conEmpty.size(); i++) {
                changes.addAll(insertLines(conEmpty.get(i)));
            }
            return changes;
        }

        if (tplSegments.size() == conSegments.size()
                && tplSegments.size() > 1
                && segmentsSameKind(tplSegments, conSegments)) {
            return diffBySegments(tplSegments, conSegments);
        }

        return diffLineByLine(templateLines, contractLines);
    }

    private boolean segmentsSameKind(List<Segment> tplSegments, List<Segment> conSegments) {
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

    private List<RawChange> diffBySegments(List<Segment> tplSegments, List<Segment> conSegments) {
        List<RawChange> changes = new ArrayList<>();
        for (int i = 0; i < tplSegments.size(); i++) {
            List<LineUnit> tplChunk = tplSegments.get(i).lines();
            List<LineUnit> conChunk = conSegments.get(i).lines();
            if (!tplChunk.isEmpty() && !tplChunk.get(0).normalized().isEmpty()) {
                changes.addAll(diffContentSection(tplChunk, conChunk));
            } else {
                changes.addAll(diffEmptyRun(tplChunk, conChunk));
            }
        }
        return changes;
    }

    private List<RawChange> diffContentSection(List<LineUnit> tpl, List<LineUnit> con) {
        List<RawChange> changes = new ArrayList<>();
        int i = 0;
        int j = 0;

        while (i < tpl.size() && j < con.size()) {
            if (tpl.get(i).normalized().equals(con.get(j).normalized())) {
                i++;
                j++;
                continue;
            }

            Integer tplInCon = findLineIn(tpl.get(i).normalized(), con, j + 1, con.size());
            Integer conInTpl = findLineIn(con.get(j).normalized(), tpl, i + 1, tpl.size());

            if (tplInCon != null && conInTpl == null) {
                changes.add(RawChange.insert(con.get(j)));
                j++;
            } else if (conInTpl != null && tplInCon == null) {
                changes.add(RawChange.delete(tpl.get(i)));
                i++;
            } else if (tplInCon != null && conInTpl != null) {
                if (tplInCon - j <= conInTpl - i) {
                    changes.add(RawChange.insert(con.get(j)));
                    j++;
                } else {
                    changes.add(RawChange.delete(tpl.get(i)));
                    i++;
                }
            } else {
                changes.add(RawChange.delete(tpl.get(i)));
                i++;
            }
        }

        changes.addAll(deleteLines(tpl.subList(i, tpl.size())));
        changes.addAll(insertLines(con.subList(j, con.size())));
        return changes;
    }

    private List<RawChange> diffEmptyRun(List<LineUnit> tpl, List<LineUnit> con) {
        int pairCount = Math.min(tpl.size(), con.size());
        List<RawChange> changes = new ArrayList<>();
        if (pairCount < tpl.size()) {
            changes.addAll(deleteLines(tpl.subList(pairCount, tpl.size())));
        }
        if (pairCount < con.size()) {
            changes.addAll(insertLines(con.subList(pairCount, con.size())));
        }
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

    private List<RawChange> diffLineByLine(List<LineUnit> tpl, List<LineUnit> con) {
        return diffRange(tpl, con, 0, tpl.size(), 0, con.size());
    }

    private List<RawChange> diffRange(
            List<LineUnit> tpl,
            List<LineUnit> con,
            int i,
            int iEnd,
            int j,
            int jEnd
    ) {
        List<RawChange> changes = new ArrayList<>();

        while (i < iEnd && j < jEnd) {
            LineUnit tplLine = tpl.get(i);
            LineUnit conLine = con.get(j);

            if (tplLine.normalized().equals(conLine.normalized())) {
                i++;
                j++;
                continue;
            }

            if (tplLine.normalized().isEmpty() && !conLine.normalized().isEmpty()) {
                if (i + 1 < iEnd && tpl.get(i + 1).normalized().equals(conLine.normalized())) {
                    changes.add(RawChange.delete(tplLine));
                    i++;
                    continue;
                }
            } else if (!tplLine.normalized().isEmpty() && conLine.normalized().isEmpty()) {
                if (j + 1 < jEnd && con.get(j + 1).normalized().equals(tplLine.normalized())) {
                    changes.add(RawChange.insert(conLine));
                    j++;
                    continue;
                }
            }

            Integer tplInCon = findLineIn(tplLine.normalized(), con, j + 1, jEnd);
            Integer conInTpl = findLineIn(conLine.normalized(), tpl, i + 1, iEnd);

            if (tplInCon != null && conInTpl == null) {
                changes.add(RawChange.insert(conLine));
                j++;
            } else if (conInTpl != null && tplInCon == null) {
                changes.add(RawChange.delete(tplLine));
                i++;
            } else if (tplInCon != null && conInTpl != null) {
                if (tplInCon - j <= conInTpl - i) {
                    changes.add(RawChange.insert(conLine));
                    j++;
                } else {
                    changes.add(RawChange.delete(tplLine));
                    i++;
                }
            } else {
                changes.add(RawChange.delete(tplLine));
                i++;
            }
        }

        changes.addAll(deleteLines(tpl.subList(i, iEnd)));
        changes.addAll(insertLines(con.subList(j, jEnd)));
        return changes;
    }

    private Integer findLineIn(String text, List<LineUnit> lines, int start, int end) {
        for (int idx = start; idx < end; idx++) {
            if (lines.get(idx).normalized().equals(text)) {
                return idx;
            }
        }
        return null;
    }
}
