package com.pdfdiff.domain;

import java.util.List;

public record LineUnit(
        String id,
        int page,
        String text,
        String normalized,
        double[] bbox,
        List<CharBBox> charBboxes
) {
    public LineUnit {
        charBboxes = charBboxes == null ? List.of() : List.copyOf(charBboxes);
    }
}
