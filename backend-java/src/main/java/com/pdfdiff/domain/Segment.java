package com.pdfdiff.domain;

import java.util.List;

public record Segment(String kind, List<LineUnit> lines) {
}
