package com.pdfdiff.model;

import java.util.List;

public record Segment(String kind, List<LineUnit> lines) {
}
