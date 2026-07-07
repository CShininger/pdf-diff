package com.pdfdiff.util;

import com.pdfdiff.model.CharBBox;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Pattern;

/** 过滤半透明水印/行首编号等噪声文本，与前端 pdfExtract 逻辑对齐。 */
public final class WatermarkUtil {

    private static final Pattern PURE_DIGITS = Pattern.compile("^\\d{4,}$");

    private WatermarkUtil() {}

    public record CleanTextResult(String text, List<CharBBox> charBboxes) {}

    /** 整段纯数字且 bbox 偏高 → 水印，不参与比对 */
    public static boolean isNumericWatermark(String text, double bboxHeight, double fontSize) {
        return text != null
                && PURE_DIGITS.matcher(text.strip()).matches()
                && bboxHeight > fontSize * 1.2;
    }

    /** 去掉 bbox 偏高的水印字符 */
    public static CleanTextResult stripWatermarkChars(
            String text, List<CharBBox> charBboxes, double fontSize) {
        if (text == null || text.isEmpty() || charBboxes.isEmpty()) {
            return null;
        }

        List<Double> heights = new ArrayList<>(charBboxes.size());
        for (CharBBox cb : charBboxes) {
            heights.add(cb.bbox()[3] - cb.bbox()[1]);
        }
        List<Double> sorted = new ArrayList<>(heights);
        sorted.sort(Comparator.naturalOrder());
        double medianH = sorted.get(sorted.size() / 2);
        double threshold = Math.max(medianH * 1.8, fontSize * 1.8);

        StringBuilder nextText = new StringBuilder();
        List<CharBBox> nextBboxes = new ArrayList<>();
        int offset = 0;

        for (int i = 0; i < text.length(); i++) {
            if (i >= charBboxes.size()) {
                break;
            }
            CharBBox cb = charBboxes.get(i);
            double h = cb.bbox()[3] - cb.bbox()[1];
            if (h > threshold) {
                continue;
            }
            nextText.append(text.charAt(i));
            nextBboxes.add(new CharBBox(offset, offset + 1, cb.bbox()));
            offset++;
        }

        if (nextText.isEmpty()) {
            return null;
        }
        return new CleanTextResult(nextText.toString(), nextBboxes);
    }

    /** 行首数字水印与正文混排时，按 bbox 高度差剥离前缀编号 */
    public static CleanTextResult stripLeadingNumericWatermark(
            String text, List<CharBBox> charBboxes) {
        if (charBboxes.size() < 8) {
            return new CleanTextResult(text, charBboxes);
        }

        List<Double> tailHeights = new ArrayList<>();
        for (int i = 6; i < charBboxes.size(); i++) {
            tailHeights.add(charBboxes.get(i).bbox()[3] - charBboxes.get(i).bbox()[1]);
        }
        List<Double> sortedTail = new ArrayList<>(tailHeights);
        sortedTail.sort(Comparator.naturalOrder());
        double tailMedian = sortedTail.get(sortedTail.size() / 2);
        double threshold = tailMedian * 1.5;

        int cutAt = 0;
        int limit = Math.min(6, text.length());
        for (int i = 0; i < limit; i++) {
            char ch = text.charAt(i);
            if (ch < '0' || ch > '9') {
                break;
            }
            double h = charBboxes.get(i).bbox()[3] - charBboxes.get(i).bbox()[1];
            if (h > threshold) {
                cutAt = i + 1;
            } else {
                break;
            }
        }
        if (cutAt < 4) {
            return new CleanTextResult(text, charBboxes);
        }

        String nextText = text.substring(cutAt);
        List<CharBBox> nextBboxes = new ArrayList<>();
        for (int i = cutAt; i < charBboxes.size(); i++) {
            nextBboxes.add(new CharBBox(i - cutAt, i - cutAt + 1, charBboxes.get(i).bbox()));
        }
        return new CleanTextResult(nextText, nextBboxes);
    }

    public static CleanTextResult cleanWatermarkText(
            String text, List<CharBBox> charBboxes, double fontSize) {
        CleanTextResult stripped = stripWatermarkChars(text, charBboxes, fontSize);
        if (stripped == null) {
            return null;
        }
        CleanTextResult cleaned =
                stripLeadingNumericWatermark(stripped.text(), stripped.charBboxes());
        if (cleaned.text() == null || cleaned.text().isEmpty()) {
            return null;
        }
        return cleaned;
    }

    public static double[] bboxFromCharBboxes(List<CharBBox> charBboxes) {
        double x0 = Double.POSITIVE_INFINITY;
        double y0 = Double.POSITIVE_INFINITY;
        double x1 = Double.NEGATIVE_INFINITY;
        double y1 = Double.NEGATIVE_INFINITY;
        for (CharBBox cb : charBboxes) {
            double[] b = cb.bbox();
            x0 = Math.min(x0, b[0]);
            y0 = Math.min(y0, b[1]);
            x1 = Math.max(x1, b[2]);
            y1 = Math.max(y1, b[3]);
        }
        return new double[] {x0, y0, x1, y1};
    }
}
