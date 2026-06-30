package com.pdfdiff.util;

import com.pdfdiff.model.LineUnit;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

public final class ContentFilter {

    private static final Pattern PAGE_NUMBER = Pattern.compile(
            "^("
                    + "\\d{1,4}"
                    + "|[-—–·]\\s*\\d{1,4}\\s*[-—–·]"
                    + "|第\\s*\\d{1,4}\\s*页"
                    + "|\\d{1,4}\\s*/\\s*\\d{1,4}"
                    + "|[Pp]age\\s*\\d{1,4}"
                    + "|\\d{1,4}\\s*of\\s*\\d{1,4}"
                    + ")$"
    );

    private ContentFilter() {
    }

    public static boolean isPageNumber(String text) {
        if (text == null || text.isEmpty()) {
            return false;
        }
        return PAGE_NUMBER.matcher(text.strip()).matches();
    }

    public static List<LineUnit> excludeNonContent(List<LineUnit> lines) {
        List<LineUnit> kept = new ArrayList<>();
        for (LineUnit line : lines) {
            if (line.normalized() == null || line.normalized().isEmpty()) {
                continue;
            }
            if (isPageNumber(line.normalized()) || isPageNumber(line.text())) {
                continue;
            }
            kept.add(line);
        }
        return kept;
    }
}
