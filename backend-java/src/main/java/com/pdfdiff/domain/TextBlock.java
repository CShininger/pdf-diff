package com.pdfdiff.domain;

import java.util.ArrayList;
import java.util.List;

public record TextBlock(
        int page,
        String text,
        double[] bbox,
        double fontSize,
        List<CharBBox> charBboxes
) {
    public TextBlock {
        charBboxes = charBboxes == null ? List.of() : List.copyOf(charBboxes);
    }

    public static TextBlock of(int page, String text, double[] bbox, double fontSize, List<CharBBox> charBboxes) {
        return new TextBlock(page, text, bbox, fontSize, charBboxes == null ? new ArrayList<>() : charBboxes);
    }
}
