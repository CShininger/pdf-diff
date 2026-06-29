package com.pdfdiff.service;

import com.pdfdiff.model.LineUnit;
import com.pdfdiff.model.TextBlock;

import java.util.List;

public interface LineService {

    List<LineUnit> blocksToLines(List<TextBlock> blocks, String prefix, boolean ignoreWhitespace);
}
