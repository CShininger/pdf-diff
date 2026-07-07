package com.pdfdiff.service.impl;

import com.pdfdiff.model.CharBBox;
import com.pdfdiff.model.LineRange;
import com.pdfdiff.model.LineUnit;
import com.pdfdiff.model.RawChange;
import com.pdfdiff.service.DiffEngine;
import com.pdfdiff.util.ContentFilter;
import com.pdfdiff.util.SequenceMatcher;
import com.pdfdiff.util.SequenceMatcher.Opcode;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 全文 normalized 字符流 diff：跨页连续比对，按相同行锚点分段以提升大文档性能。
 */
@Service
public class DiffEngineImpl implements DiffEngine {

    private static final int LAYOUT_ONLY_MAX_LEN = 64;

    @Override
    public List<RawChange> diffLines(List<LineUnit> templateLines, List<LineUnit> contractLines) {
        TextStream tplStream = TextStream.fromLines(ContentFilter.excludeNonContent(templateLines));
        TextStream conStream = TextStream.fromLines(ContentFilter.excludeNonContent(contractLines));

        if (tplStream.text().isEmpty() && conStream.text().isEmpty()) {
            return List.of();
        }

        List<RawChange> changes = new ArrayList<>();
        for (Opcode opcode : resolveOpcodes(tplStream, conStream)) {
            switch (opcode.tag()) {
                case "delete" -> emitSideChanges(changes, tplStream, conStream, opcode.i1(), opcode.i2(), false);
                case "insert" -> emitInsertChanges(
                        changes, tplStream, conStream, opcode.i1(), opcode.j1(), opcode.j2());
                case "replace" -> emitReplaceChanges(
                        changes, tplStream, conStream,
                        opcode.i1(), opcode.i2(), opcode.j1(), opcode.j2());
                default -> {
                }
            }
        }
        return changes;
    }

    private List<Opcode> resolveOpcodes(TextStream tplStream, TextStream conStream) {
        return getAnchoredOpcodes(tplStream, conStream);
    }

    /** 大文档按相同行锚点分段 diff，避免整篇字符级 Myers。 */
    private List<Opcode> getAnchoredOpcodes(TextStream tplStream, TextStream conStream) {
        List<LineRange> tplRanges = buildLineRanges(tplStream);
        List<LineRange> conRanges = buildLineRanges(conStream);

        Map<String, List<Integer>> conByNorm = new HashMap<>();
        for (int j = 0; j < conRanges.size(); j++) {
            String norm = conStream.lines().get(conRanges.get(j).lineIndex()).normalized();
            conByNorm.computeIfAbsent(norm, key -> new ArrayList<>()).add(j);
        }

        List<AnchorPair> anchors = new ArrayList<>();
        Map<String, Integer> conCursor = new HashMap<>();
        int lastConIdx = -1;

        for (int i = 0; i < tplRanges.size(); i++) {
            String norm = tplStream.lines().get(tplRanges.get(i).lineIndex()).normalized();
            List<Integer> list = conByNorm.get(norm);
            if (list == null) {
                continue;
            }

            int cursor = conCursor.getOrDefault(norm, 0);
            while (cursor < list.size() && list.get(cursor) <= lastConIdx) {
                cursor++;
            }

            if (cursor < list.size()) {
                int conIdx = list.get(cursor);
                anchors.add(new AnchorPair(i, conIdx));
                conCursor.put(norm, cursor + 1);
                lastConIdx = conIdx;
            }
        }

        List<Opcode> opcodes = new ArrayList<>();
        int tplStart = 0;
        int conStart = 0;

        for (AnchorPair anchor : anchors) {
            int tplAnchorStart = tplRanges.get(anchor.tplIdx()).start();
            int conAnchorStart = conRanges.get(anchor.conIdx()).start();

            if (tplStart < tplAnchorStart || conStart < conAnchorStart) {
                opcodes.addAll(
                        SequenceMatcher.offsetOpcodes(
                                SequenceMatcher.getOpcodes(
                                        tplStream.text().substring(tplStart, tplAnchorStart),
                                        conStream.text().substring(conStart, conAnchorStart)),
                                tplStart,
                                conStart));
            }

            tplStart = tplRanges.get(anchor.tplIdx()).end();
            conStart = conRanges.get(anchor.conIdx()).end();
        }

        if (tplStart < tplStream.text().length() || conStart < conStream.text().length()) {
            opcodes.addAll(
                    SequenceMatcher.offsetOpcodes(
                            SequenceMatcher.getOpcodes(
                                    tplStream.text().substring(tplStart),
                                    conStream.text().substring(conStart)),
                            tplStart,
                            conStart));
        }

        return opcodes;
    }

    private List<LineRange> buildLineRanges(TextStream stream) {
        List<LineRange> ranges = new ArrayList<>();
        if (stream.charMap().isEmpty()) {
            return ranges;
        }

        int start = 0;
        int currentLine = stream.charMap().get(0).lineIndex();

        for (int i = 1; i <= stream.charMap().size(); i++) {
            int nextLine = i < stream.charMap().size() ? stream.charMap().get(i).lineIndex() : -1;
            if (nextLine != currentLine) {
                ranges.add(new LineRange(currentLine, start, i));
                start = i;
                currentLine = nextLine;
            }
        }

        return ranges;
    }

    private void emitSideChanges(
            List<RawChange> changes,
            TextStream stream,
            TextStream other,
            int start,
            int end,
            boolean insert
    ) {
        for (PageSlice slice : sliceByPage(stream, start, end)) {
            if (!shouldReport(slice.snippet(), slice.bboxes(), other.text())) {
                continue;
            }
            LineUnit snippet = toSnippetLine(stream.lines(), slice);
            changes.add(insert
                    ? RawChange.insert(snippet, slice.bboxes())
                    : RawChange.delete(snippet, slice.bboxes()));
        }
    }

    private void emitInsertChanges(
            List<RawChange> changes,
            TextStream tplStream,
            TextStream conStream,
            int tplAnchor,
            int conStart,
            int conEnd
    ) {
        PageSlice anchor = getAnchorSlice(tplStream, tplAnchor);
        for (PageSlice slice : sliceByPage(conStream, conStart, conEnd)) {
            if (!shouldReport(slice.snippet(), slice.bboxes(), tplStream.text())) {
                continue;
            }
            LineUnit contractLine = toSnippetLine(conStream.lines(), slice);
            if (anchor == null) {
                changes.add(RawChange.insert(contractLine, slice.bboxes()));
            } else {
                changes.add(RawChange.insertWithAnchor(
                        toSnippetLine(tplStream.lines(), anchor),
                        anchor.bboxes(),
                        contractLine,
                        slice.bboxes()));
            }
        }
    }

    private void emitReplaceChanges(
            List<RawChange> changes,
            TextStream tplStream,
            TextStream conStream,
            int tplStart,
            int tplEnd,
            int conStart,
            int conEnd
    ) {
        String tplSnippet = tplStream.text().substring(tplStart, tplEnd);
        String conSnippet = conStream.text().substring(conStart, conEnd);
        if (tplSnippet.isEmpty() && conSnippet.isEmpty()) {
            return;
        }
        if (isLayoutOnly(tplSnippet, conStream.text()) && isLayoutOnly(conSnippet, tplStream.text())) {
            return;
        }

        List<PageSlice> tplSlices = sliceByPage(tplStream, tplStart, tplEnd);
        List<PageSlice> conSlices = sliceByPage(conStream, conStart, conEnd);

        if (tplSlices.size() == 1 && conSlices.size() == 1) {
            PageSlice tplSlice = tplSlices.get(0);
            PageSlice conSlice = conSlices.get(0);
            if (shouldReport(tplSlice.snippet(), tplSlice.bboxes(), conStream.text())
                    && shouldReport(conSlice.snippet(), conSlice.bboxes(), tplStream.text())) {
                changes.add(RawChange.replace(
                        toSnippetLine(tplStream.lines(), tplSlice),
                        toSnippetLine(conStream.lines(), conSlice),
                        tplSlice.bboxes(),
                        conSlice.bboxes()));
                return;
            }
        }

        emitSideChanges(changes, tplStream, conStream, tplStart, tplEnd, false);
        emitInsertChanges(changes, tplStream, conStream, tplEnd, conStart, conEnd);
    }

    private boolean shouldReport(String snippet, List<double[]> bboxes, String otherFullText) {
        return !snippet.isEmpty()
                && !bboxes.isEmpty()
                && !isLayoutOnly(snippet, otherFullText);
    }

    private boolean isLayoutOnly(String snippet, String otherFullText) {
        if (snippet.isEmpty() || ContentFilter.isPageNumber(snippet)) {
            return true;
        }
        return snippet.length() <= LAYOUT_ONLY_MAX_LEN && otherFullText.contains(snippet);
    }

    private PageSlice getAnchorSlice(TextStream stream, int anchorIndex) {
        List<CharRef> charMap = stream.charMap();
        if (charMap.isEmpty()) {
            return null;
        }

        int len = charMap.size();
        CharRef ref;
        boolean atEnd;

        if (anchorIndex <= 0) {
            ref = charMap.get(0);
            atEnd = false;
        } else if (anchorIndex >= len) {
            ref = charMap.get(len - 1);
            atEnd = true;
        } else {
            ref = charMap.get(anchorIndex - 1);
            atEnd = true;
        }

        LineUnit line = stream.lines().get(ref.lineIndex());
        List<double[]> bboxes = bboxesForRawPositions(line, List.of(ref.rawPos()));
        double[] markerBbox;
        if (!bboxes.isEmpty()) {
            markerBbox = anchorMarkerFromBbox(bboxes.get(bboxes.size() - 1), atEnd);
        } else {
            markerBbox = anchorMarkerFromBbox(line.bbox(), atEnd);
        }

        return new PageSlice(line.page(), "", List.of(markerBbox), ref.lineIndex());
    }

    private double[] anchorMarkerFromBbox(double[] bbox, boolean atEnd) {
        double x0 = bbox[0];
        double y0 = bbox[1];
        double x1 = bbox[2];
        double y1 = bbox[3];
        double height = Math.max(y1 - y0, 4);
        if (atEnd) {
            return new double[] {Math.max(x1 - 1, x0), y0, x1 + 1, y0 + height};
        }
        return new double[] {x0 - 1, y0, x0 + 1, y0 + height};
    }

    private LineUnit toSnippetLine(List<LineUnit> lines, PageSlice slice) {
        LineUnit ref = lines.get(slice.refLineIndex());
        return new LineUnit(ref.id(), slice.page(), slice.snippet(), slice.snippet(), ref.bbox(), List.of());
    }

    private List<PageSlice> sliceByPage(TextStream stream, int start, int end) {
        Map<Integer, PageSliceBuilder> builders = new LinkedHashMap<>();
        for (int tokenIndex = start; tokenIndex < end; tokenIndex++) {
            CharRef ref = stream.charMap().get(tokenIndex);
            LineUnit line = stream.lines().get(ref.lineIndex());
            builders.computeIfAbsent(line.page(), key -> new PageSliceBuilder(line.page(), stream.lines()))
                    .append(ref, stream.text().charAt(tokenIndex));
        }

        List<PageSlice> slices = new ArrayList<>();
        for (PageSliceBuilder builder : builders.values()) {
            PageSlice slice = builder.build();
            if (!slice.snippet().isEmpty()) {
                slices.add(slice);
            }
        }
        return slices;
    }

    private List<double[]> bboxesForRawPositions(LineUnit line, List<Integer> rawPositions) {
        if (rawPositions.isEmpty() || line.charBboxes().isEmpty()) {
            return List.of();
        }

        List<double[]> bboxes = new ArrayList<>();
        for (int[] range : mergePositions(rawPositions)) {
            int rangeStart = range[0];
            int rangeEnd = range[1];
            for (CharBBox charBBox : line.charBboxes()) {
                if (charBBox.end() <= rangeStart || charBBox.start() >= rangeEnd) {
                    continue;
                }
                bboxes.add(charBBox.bbox());
            }
        }
        return SequenceMatcher.mergeAdjacent(bboxes);
    }

    private List<int[]> mergePositions(List<Integer> positions) {
        if (positions.isEmpty()) {
            return List.of();
        }
        List<Integer> sorted = positions.stream().distinct().sorted().toList();
        List<int[]> ranges = new ArrayList<>();
        int rangeStart = sorted.get(0);
        int rangeEnd = rangeStart + 1;

        for (int i = 1; i < sorted.size(); i++) {
            int pos = sorted.get(i);
            if (pos <= rangeEnd) {
                rangeEnd = Math.max(rangeEnd, pos + 1);
            } else {
                ranges.add(new int[] {rangeStart, rangeEnd});
                rangeStart = pos;
                rangeEnd = pos + 1;
            }
        }
        ranges.add(new int[] {rangeStart, rangeEnd});
        return ranges;
    }

    private record AnchorPair(int tplIdx, int conIdx) {}

    private record CharRef(int lineIndex, int rawPos) {}

    private record PageSlice(int page, String snippet, List<double[]> bboxes, int refLineIndex) {}

    private final class PageSliceBuilder {
        private final int page;
        private final List<LineUnit> lines;
        private final StringBuilder snippet = new StringBuilder();
        private final Map<Integer, List<Integer>> positionsByLine = new LinkedHashMap<>();
        private int refLineIndex = -1;

        private PageSliceBuilder(int page, List<LineUnit> lines) {
            this.page = page;
            this.lines = lines;
        }

        private void append(CharRef ref, char ch) {
            if (refLineIndex < 0) {
                refLineIndex = ref.lineIndex();
            }
            snippet.append(ch);
            positionsByLine
                    .computeIfAbsent(ref.lineIndex(), key -> new ArrayList<>())
                    .add(ref.rawPos());
        }

        private PageSlice build() {
            List<double[]> bboxes = new ArrayList<>();
            for (Map.Entry<Integer, List<Integer>> entry : positionsByLine.entrySet()) {
                bboxes.addAll(bboxesForRawPositions(lines.get(entry.getKey()), entry.getValue()));
            }
            return new PageSlice(
                    page,
                    snippet.toString(),
                    SequenceMatcher.mergeAdjacent(bboxes),
                    Math.max(refLineIndex, 0));
        }
    }

    private record TextStream(String text, List<CharRef> charMap, List<LineUnit> lines) {
        static TextStream fromLines(List<LineUnit> lines) {
            StringBuilder textBuilder = new StringBuilder();
            List<CharRef> charMap = new ArrayList<>();

            for (int lineIndex = 0; lineIndex < lines.size(); lineIndex++) {
                String normalized = lines.get(lineIndex).normalized();
                if (normalized == null || normalized.isEmpty()) {
                    continue;
                }

                if (!textBuilder.isEmpty() && textBuilder.charAt(textBuilder.length() - 1) == '-') {
                    textBuilder.deleteCharAt(textBuilder.length() - 1);
                    if (!charMap.isEmpty()) {
                        charMap.remove(charMap.size() - 1);
                    }
                }

                LineUnit line = lines.get(lineIndex);
                List<Integer> rawPositions = nonWhitespacePositions(line.text());
                int count = Math.min(rawPositions.size(), normalized.length());
                for (int k = 0; k < count; k++) {
                    charMap.add(new CharRef(lineIndex, rawPositions.get(k)));
                    textBuilder.append(normalized.charAt(k));
                }
            }

            return new TextStream(textBuilder.toString(), charMap, lines);
        }

        private static List<Integer> nonWhitespacePositions(String text) {
            List<Integer> positions = new ArrayList<>();
            if (text == null) {
                return positions;
            }
            for (int i = 0; i < text.length(); i++) {
                if (!Character.isWhitespace(text.charAt(i))) {
                    positions.add(i);
                }
            }
            return positions;
        }
    }
}
