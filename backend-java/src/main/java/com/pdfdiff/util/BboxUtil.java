package com.pdfdiff.util;

import org.apache.fontbox.util.BoundingBox;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.text.TextPosition;

import java.io.IOException;

public final class BboxUtil {

    private BboxUtil() {
    }

    public static double[] toTopLeftBBox(TextPosition tp) {
        double x0 = tp.getXDirAdj();
        double x1 = tp.getEndX();
        double yBaseline = tp.getYDirAdj();
        double ascent;
        double descent;

        try {
            PDFont font = tp.getFont();
            float fontSize = tp.getFontSizeInPt();
            BoundingBox bb = font.getBoundingBox();
            ascent = bb.getUpperRightY() / 1000.0 * fontSize;
            descent = Math.abs(bb.getLowerLeftY()) / 1000.0 * fontSize;
        } catch (IOException ex) {
            ascent = tp.getHeightDir();
            descent = tp.getHeightDir() * 0.25;
        }

        double y0 = yBaseline - ascent;
        double y1 = yBaseline + descent;
        return new double[]{x0, y0, x1, y1};
    }
}
