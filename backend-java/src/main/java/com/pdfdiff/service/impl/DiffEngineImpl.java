package com.pdfdiff.service.impl;

import com.pdfdiff.model.CharBBox;
import com.pdfdiff.model.LineUnit;
import com.pdfdiff.model.RawChange;
import com.pdfdiff.service.DiffEngine;
import com.pdfdiff.util.ContentFilter;
import com.pdfdiff.util.SequenceMatcher;
import com.pdfdiff.util.SequenceMatcher.Opcode;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 全文 normalized 字符流 diff：跨页连续比对，高亮仅覆盖改动字符。
 */
@Service
public class DiffEngineImpl implements DiffEngine {

    @Override
    public List<RawChange> diffLines(List<LineUnit> templateLines, List<LineUnit> contractLines) {
        TextStream tplStream = TextStream.fromLines(ContentFilter.excludeNonContent(templateLines));
        TextStream conStream = TextStream.fromLines(ContentFilter.excludeNonContent(contractLines));

        if (tplStream.text().isEmpty() && conStream.text().isEmpty()) {
            return List.of();
        }

        List<RawChange> changes = new ArrayList<>();
        List<String> tplTokens = SequenceMatcher.toCharTokens(tplStream.text());
        List<String> conTokens = SequenceMatcher.toCharTokens(conStream.text());

        for (Opcode opcode : SequenceMatcher.getOpcodes(tplTokens, conTokens)) {
            switch (opcode.tag()) {
                case "delete" -> emitSideChanges(changes, tplStream, conStream, opcode.i1(), opcode.i2(), false);
                case "insert" -> emitSideChanges(changes, conStream, tplStream, opcode.j1(), opcode.j2(), true);
                case "replace" -> emitReplaceChanges(
                        changes, tplStream, conStream,
                        opcode.i1(), opcode.i2(), opcode.j1(), opcode.j2()
                );
                default -> {
                }
            }
        }
        return changes;
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
                        conSlice.bboxes()
                ));
                return;
            }
        }

        emitSideChanges(changes, tplStream, conStream, tplStart, tplEnd, false);
        emitSideChanges(changes, conStream, tplStream, conStart, conEnd, true);
    }

    private boolean shouldReport(String snippet, List<double[]> bboxes, String otherFullText) {
        return !snippet.isEmpty()
                && !bboxes.isEmpty()
                && !isLayoutOnly(snippet, otherFullText);
    }

    private boolean isLayoutOnly(String snippet, String otherFullText) {
        return snippet.isEmpty()
                || ContentFilter.isPageNumber(snippet)
                || otherFullText.contains(snippet);
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
                ranges.add(new int[]{rangeStart, rangeEnd});
                rangeStart = pos;
                rangeEnd = pos + 1;
            }
        }
        ranges.add(new int[]{rangeStart, rangeEnd});
        return ranges;
    }

    private record CharRef(int lineIndex, int rawPos) {
    }

    private record PageSlice(int page, String snippet, List<double[]> bboxes, int refLineIndex) {
    }

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
                    Math.max(refLineIndex, 0)
            );
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
