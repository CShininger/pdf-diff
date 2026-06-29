package com.pdfdiff.dto;

import java.util.List;

public record HistoryListResponse(List<HistoryItem> items, int total) {}
