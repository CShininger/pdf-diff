package com.pdfdiff.service.impl;

import com.pdfdiff.model.CharBBox;
import com.pdfdiff.model.TextBlock;
import com.pdfdiff.service.PdfExtractService;
import com.pdfdiff.util.BboxUtil;
import com.pdfdiff.util.ContentFilter;
import com.pdfdiff.util.WatermarkUtil;
import com.pdfdiff.util.WatermarkUtil.CleanTextResult;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
public class PdfExtractServiceImpl implements PdfExtractService {

    private static final double HEADER_FOOTER_RATIO = 0.08;

    @Override
    public List<TextBlock> extractTextBlocks(Path pdfPath, boolean ignoreHeaderFooter)
            throws IOException {
        List<TextBlock> blocks = new ArrayList<>();

        try (PDDocument document = Loader.loadPDF(pdfPath.toFile())) {
            PositionCollector collector = new PositionCollector();
            collector.setSortByPosition(true);
            collector.getText(document);

            for (PagePositions pagePositions : collector.getPages()) {
                double pageHeight = pagePositions.pageHeight();
                double headerLimit = pageHeight * HEADER_FOOTER_RATIO;
                double footerLimit = pageHeight * (1 - HEADER_FOOTER_RATIO);

                List<LineGroup> lineGroups =
                        groupPositionsIntoLines(pagePositions.positions(), pageHeight);
                for (LineGroup group : lineGroups) {
                    String text = group.text();
                    String visibleText = text.strip().isEmpty() ? "" : text;

                    if (!visibleText.isEmpty() && ignoreHeaderFooter) {
                        double centerY = (group.y0() + group.y1()) / 2;
                        if (centerY < headerLimit || centerY > footerLimit) {
                            if (ContentFilter.isPageNumber(visibleText.strip())) {
                                continue;
                            }
                        }
                    }

                    double fontSize =
                            group.fontSizes().isEmpty()
                                    ? Math.max(group.y1() - group.y0(), 12)
                                    : group.fontSizes().stream()
                                            .mapToDouble(Double::doubleValue)
                                            .average()
                                            .orElse(12);

                    blocks.add(
                            TextBlock.of(
                                    pagePositions.pageIndex(),
                                    visibleText,
                                    new double[] {group.x0(), group.y0(), group.x1(), group.y1()},
                                    fontSize,
                                    group.charBboxes()));
                }
            }
        }

        return blocks;
    }

    private List<LineGroup> groupPositionsIntoLines(
            List<PositionEntry> positions, double pageHeight) {
        if (positions.isEmpty()) {
            return List.of();
        }

        List<PositionEntry> sorted = new ArrayList<>(positions);
        sorted.sort(
                Comparator.comparingDouble(PositionEntry::y0)
                        .thenComparingDouble(PositionEntry::x0));

        List<LineGroup> groups = new ArrayList<>();
        List<PositionEntry> current = new ArrayList<>();
        current.add(sorted.get(0));

        for (int i = 1; i < sorted.size(); i++) {
            PositionEntry prev = current.get(current.size() - 1);
            PositionEntry curr = sorted.get(i);
            double lineHeight = Math.max(prev.y1() - prev.y0(), prev.fontSize());
            double prevCy = (prev.y0() + prev.y1()) / 2;
            double currCy = (curr.y0() + curr.y1()) / 2;

            if (Math.abs(prevCy - currCy) < lineHeight * 0.5) {
                current.add(curr);
            } else {
                groups.add(buildLineGroup(current));
                current = new ArrayList<>();
                current.add(curr);
            }
        }
        groups.add(buildLineGroup(current));
        return groups;
    }

    private LineGroup buildLineGroup(List<PositionEntry> entries) {
        StringBuilder textBuilder = new StringBuilder();
        List<CharBBox> charBboxes = new ArrayList<>();
        List<Double> fontSizes = new ArrayList<>();
        int offset = 0;

        for (PositionEntry entry : entries) {
            String part = entry.text();
            charBboxes.add(new CharBBox(offset, offset + part.length(), entry.bbox()));
            textBuilder.append(part);
            fontSizes.add(entry.fontSize());
            offset += part.length();
        }

        String joined = textBuilder.toString();
        double avgFont =
                fontSizes.isEmpty()
                        ? 12
                        : fontSizes.stream().mapToDouble(Double::doubleValue).average().orElse(12);
        CleanTextResult cleaned = WatermarkUtil.cleanWatermarkText(joined, charBboxes, avgFont);
        if (cleaned == null) {
            return new LineGroup("", 0, 0, 0, 0, List.of(), fontSizes);
        }

        double[] lineBbox = WatermarkUtil.bboxFromCharBboxes(cleaned.charBboxes());
        return new LineGroup(
                cleaned.text(),
                lineBbox[0],
                lineBbox[1],
                lineBbox[2],
                lineBbox[3],
                cleaned.charBboxes(),
                fontSizes);
    }

    private record PositionEntry(
            String text,
            double[] bbox,
            double x0,
            double y0,
            double x1,
            double y1,
            double fontSize) {}

    private record LineGroup(
            String text,
            double x0,
            double y0,
            double x1,
            double y1,
            List<CharBBox> charBboxes,
            List<Double> fontSizes) {}

    private record PagePositions(int pageIndex, double pageHeight, List<PositionEntry> positions) {}

    private static final class PositionCollector extends PDFTextStripper {

        private final List<PagePositions> pages = new ArrayList<>();
        private List<PositionEntry> currentPagePositions = new ArrayList<>();
        private int pageIndex = 0;
        private float pageHeight = 0;

        private PositionCollector() throws IOException {
            super();
        }

        @Override
        protected void startPage(PDPage page) {
            currentPagePositions = new ArrayList<>();
            pageIndex = getCurrentPageNo() - 1;
            pageHeight = page.getMediaBox().getHeight();
        }

        @Override
        protected void endPage(PDPage page) {
            pages.add(new PagePositions(pageIndex, pageHeight, List.copyOf(currentPagePositions)));
        }

        @Override
        protected void writeString(String text, List<TextPosition> textPositions) {
            for (TextPosition tp : textPositions) {
                PositionEntry entry = entryFromTextPosition(tp);
                if (entry != null) {
                    currentPagePositions.add(entry);
                }
            }
        }

        private PositionEntry entryFromTextPosition(TextPosition tp) {
            String unicode = tp.getUnicode();
            if (unicode == null || unicode.isEmpty()) {
                return null;
            }

            double[] bbox = BboxUtil.toTopLeftBBox(tp);
            double fontSize = tp.getFontSizeInPt();
            double bboxHeight = bbox[3] - bbox[1];

            if (WatermarkUtil.isNumericWatermark(unicode, bboxHeight, fontSize)) {
                return null;
            }

            List<CharBBox> charBboxes = new ArrayList<>();
            for (int i = 0; i < unicode.length(); i++) {
                charBboxes.add(new CharBBox(i, i + 1, bbox));
            }

            CleanTextResult cleaned = WatermarkUtil.cleanWatermarkText(unicode, charBboxes, fontSize);
            if (cleaned == null) {
                return null;
            }

            double[] entryBbox = WatermarkUtil.bboxFromCharBboxes(cleaned.charBboxes());
            return new PositionEntry(
                    cleaned.text(),
                    entryBbox,
                    entryBbox[0],
                    entryBbox[1],
                    entryBbox[2],
                    entryBbox[3],
                    fontSize);
        }

        List<PagePositions> getPages() {
            return pages;
        }
    }
}
