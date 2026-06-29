package com.pdfdiff.vo;

import java.util.List;

public record SideInfo(int page, String text, List<List<Double>> bboxes) {
}
