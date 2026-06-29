package com.pdfdiff.service;

import com.pdfdiff.domain.CharBBox;
import com.pdfdiff.domain.LineUnit;
import com.pdfdiff.domain.TextBlock;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
public class LineService {

    private final NormalizeService normalizeService;

    public LineService(NormalizeService normalizeService) {
        this.normalizeService = normalizeService;
    }

    public List<LineUnit> blocksToLines(List<TextBlock> blocks, String prefix, boolean ignoreWhitespace) {
        if (blocks == null || blocks.isEmpty()) {
            return List.of();
        }

        List<TextBlock> sorted = new ArrayList<>(blocks);
        sorted.sort(Comparator
                .comparingInt(TextBlock::page)
                .thenComparingDouble(b -> b.bbox()[1])
                .thenComparingDouble(b -> b.bbox()[0]));

        List<LineUnit> lines = new ArrayList<>();
        List<TextBlock> currentRow = new ArrayList<>();
        currentRow.add(sorted.get(0));

        for (int i = 1; i < sorted.size(); i++) {
            TextBlock prev = currentRow.get(currentRow.size() - 1);
            TextBlock curr = sorted.get(i);
            if (sameLine(prev, curr)) {
                currentRow.add(curr);
            } else {
                lines.add(buildLine(currentRow, prefix, lines.size(), ignoreWhitespace));
                currentRow = new ArrayList<>();
                currentRow.add(curr);
            }
        }
        lines.add(buildLine(currentRow, prefix, lines.size(), ignoreWhitespace));
        return lines;
    }

    private boolean sameLine(TextBlock prev, TextBlock curr) {
        if (curr.page() != prev.page()) {
            return false;
        }
        double prevCy = (prev.bbox()[1] + prev.bbox()[3]) / 2;
        double currCy = (curr.bbox()[1] + curr.bbox()[3]) / 2;
        double lineHeight = Math.max(prev.bbox()[3] - prev.bbox()[1], prev.fontSize());
        return Math.abs(prevCy - currCy) < lineHeight * 0.5;
    }

    private LineUnit buildLine(List<TextBlock> row, String prefix, int index, boolean ignoreWhitespace) {
        StringBuilder textBuilder = new StringBuilder();
        List<CharBBox> charBboxes = new ArrayList<>();
        int offset = 0;

        for (TextBlock block : row) {
            textBuilder.append(block.text());
            for (CharBBox cb : block.charBboxes()) {
                charBboxes.add(new CharBBox(
                        offset + cb.start(),
                        offset + cb.end(),
                        cb.bbox()
                ));
            }
            offset += block.text().length();
        }

        String text = textBuilder.toString();
        double x0 = row.stream().mapToDouble(b -> b.bbox()[0]).min().orElse(0);
        double y0 = row.stream().mapToDouble(b -> b.bbox()[1]).min().orElse(0);
        double x1 = row.stream().mapToDouble(b -> b.bbox()[2]).max().orElse(0);
        double y1 = row.stream().mapToDouble(b -> b.bbox()[3]).max().orElse(0);

        return new LineUnit(
                prefix + "_l" + index,
                row.get(0).page(),
                text,
                normalizeService.normalize(text, ignoreWhitespace),
                new double[]{x0, y0, x1, y1},
                charBboxes
        );
    }
}
