package com.pdfdiff.vo;

import java.util.List;

public record HistoryListResponse(List<HistoryItem> items, int total) {}
