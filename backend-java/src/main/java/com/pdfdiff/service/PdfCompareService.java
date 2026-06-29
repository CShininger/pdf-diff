package com.pdfdiff.service;

import com.pdfdiff.dto.CompareOptions;

import java.io.IOException;
import java.nio.file.Path;

public interface PdfCompareService {

    de.redsix.pdfcompare.CompareResult compare(
            Path templatePath,
            Path contractPath,
            CompareOptions options
    ) throws IOException;

    int getDefaultDpi();
}
