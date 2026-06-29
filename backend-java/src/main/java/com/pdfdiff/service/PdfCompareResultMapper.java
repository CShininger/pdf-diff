package com.pdfdiff.service;

import com.pdfdiff.model.LineUnit;
import com.pdfdiff.vo.CompareResult;

import java.util.List;

public interface PdfCompareResultMapper {

    CompareResult buildVisualPageChanges(
            String jobId,
            de.redsix.pdfcompare.CompareResult pdfCompareResult,
            List<LineUnit> templateLines,
            List<LineUnit> contractLines
    );
}
