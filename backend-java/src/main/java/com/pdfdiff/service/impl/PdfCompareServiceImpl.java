package com.pdfdiff.service.impl;

import com.pdfdiff.dto.CompareOptions;
import com.pdfdiff.service.PdfCompareService;
import de.redsix.pdfcompare.CompareResultWithPageOverflow;
import de.redsix.pdfcompare.PageArea;
import de.redsix.pdfcompare.PdfComparator;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Path;

@Service
public class PdfCompareServiceImpl implements PdfCompareService {

    private static final int DEFAULT_DPI = 300;
    private static final double HEADER_FOOTER_RATIO = 0.08;

    @Override
    public de.redsix.pdfcompare.CompareResult compare(
            Path templatePath,
            Path contractPath,
            CompareOptions options
    ) throws IOException {
        PdfComparator<CompareResultWithPageOverflow> comparator = new PdfComparator<>(
                templatePath.toString(),
                contractPath.toString(),
                new CompareResultWithPageOverflow()
        );

        if (options.ignoreHeaderFooter()) {
            applyHeaderFooterExclusions(comparator, templatePath);
        }

        return comparator.compare();
    }

    @Override
    public int getDefaultDpi() {
        return DEFAULT_DPI;
    }

    private void applyHeaderFooterExclusions(
            PdfComparator<CompareResultWithPageOverflow> comparator,
            Path pdfPath
    ) throws IOException {
        try (PDDocument document = Loader.loadPDF(pdfPath.toFile())) {
            for (int pageIndex = 0; pageIndex < document.getNumberOfPages(); pageIndex++) {
                PDPage page = document.getPage(pageIndex);
                float widthPt = page.getMediaBox().getWidth();
                float heightPt = page.getMediaBox().getHeight();
                int pageNumber = pageIndex + 1;

                int widthPx = pointsToPixels(widthPt);
                int heightPx = pointsToPixels(heightPt);
                int marginPx = (int) Math.round(heightPx * HEADER_FOOTER_RATIO);

                comparator.withIgnore(new PageArea(pageNumber, 0, 0, widthPx, marginPx));
                comparator.withIgnore(new PageArea(
                        pageNumber,
                        0,
                        heightPx - marginPx,
                        widthPx,
                        heightPx
                ));
            }
        }
    }

    private int pointsToPixels(float points) {
        return (int) Math.round(points * DEFAULT_DPI / 72.0);
    }
}
