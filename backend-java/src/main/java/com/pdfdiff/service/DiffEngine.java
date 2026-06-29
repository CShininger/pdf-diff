package com.pdfdiff.service;

import com.pdfdiff.model.LineUnit;
import com.pdfdiff.model.RawChange;

import java.util.List;

public interface DiffEngine {

    List<RawChange> diffLines(List<LineUnit> templateLines, List<LineUnit> contractLines);
}
