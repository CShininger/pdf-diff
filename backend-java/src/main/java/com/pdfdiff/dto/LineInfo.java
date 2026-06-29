package com.pdfdiff.dto;

import java.util.List;

public record LineInfo(String id, int page, String text, List<List<Double>> bboxes) {
}
