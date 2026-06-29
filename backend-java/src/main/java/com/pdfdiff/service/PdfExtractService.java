package com.pdfdiff.service;

import com.pdfdiff.model.TextBlock;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;

public interface PdfExtractService {

    List<TextBlock> extractTextBlocks(Path pdfPath, boolean ignoreHeaderFooter) throws IOException;
}
