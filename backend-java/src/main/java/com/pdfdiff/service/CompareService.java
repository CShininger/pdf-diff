package com.pdfdiff.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdfdiff.config.AppConfig;
import com.pdfdiff.domain.LineUnit;
import com.pdfdiff.domain.RawChange;
import com.pdfdiff.domain.TextBlock;
import com.pdfdiff.dto.CompareOptions;
import com.pdfdiff.dto.CompareResponse;
import com.pdfdiff.dto.CompareResult;
import com.pdfdiff.exception.ApiException;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;

@Service
public class CompareService {

    private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of(
            "application/pdf",
            "application/octet-stream"
    );

    private final AppConfig appConfig;
    private final ObjectMapper objectMapper;
    private final PdfExtractService pdfExtractService;
    private final LineService lineService;
    private final DiffEngine diffEngine;
    private final ResultMapper resultMapper;

    public CompareService(
            AppConfig appConfig,
            ObjectMapper objectMapper,
            PdfExtractService pdfExtractService,
            LineService lineService,
            DiffEngine diffEngine,
            ResultMapper resultMapper
    ) {
        this.appConfig = appConfig;
        this.objectMapper = objectMapper;
        this.pdfExtractService = pdfExtractService;
        this.lineService = lineService;
        this.diffEngine = diffEngine;
        this.resultMapper = resultMapper;
    }

    public CompareResponse compare(MultipartFile template, MultipartFile contract, String optionsJson)
            throws IOException {
        validatePdf(template, "模版文件必须是 PDF");
        validatePdf(contract, "正式文件必须是 PDF");

        CompareOptions options = parseOptions(optionsJson);
        String jobId = UUID.randomUUID().toString();
        Path jobDir = appConfig.getTempDir().resolve(jobId);

        try {
            Files.createDirectories(jobDir);
            Path templatePath = jobDir.resolve("template.pdf");
            Path contractPath = jobDir.resolve("contract.pdf");
            Path resultPath = jobDir.resolve("result.json");

            saveUpload(template, templatePath);
            saveUpload(contract, contractPath);

            List<TextBlock> templateBlocks = pdfExtractService.extractTextBlocks(
                    templatePath,
                    options.ignoreHeaderFooter()
            );
            List<TextBlock> contractBlocks = pdfExtractService.extractTextBlocks(
                    contractPath,
                    options.ignoreHeaderFooter()
            );

            List<LineUnit> templateLines = lineService.blocksToLines(
                    templateBlocks,
                    "tpl",
                    options.ignoreWhitespace()
            );
            List<LineUnit> contractLines = lineService.blocksToLines(
                    contractBlocks,
                    "con",
                    options.ignoreWhitespace()
            );

            List<RawChange> rawChanges = diffEngine.diffLines(templateLines, contractLines);
            CompareResult result = resultMapper.buildCompareResult(
                    jobId,
                    templateLines,
                    contractLines,
                    rawChanges
            );

            objectMapper.writerWithDefaultPrettyPrinter().writeValue(resultPath.toFile(), result);
            return CompareResponse.done(jobId, result);
        } catch (ApiException ex) {
            deleteDirectory(jobDir);
            throw ex;
        } catch (Exception ex) {
            deleteDirectory(jobDir);
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "比对失败: " + ex.getMessage());
        }
    }

    public CompareResponse getResult(String jobId) throws IOException {
        Path resultPath = appConfig.getTempDir().resolve(jobId).resolve("result.json");
        if (!Files.exists(resultPath)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "任务不存在或已过期");
        }
        CompareResult result = objectMapper.readValue(resultPath.toFile(), CompareResult.class);
        return CompareResponse.done(jobId, result);
    }

    public Resource getPdfFile(String jobId, String which) {
        if (!Set.of("template", "contract").contains(which)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "which 只能是 template 或 contract");
        }
        Path pdfPath = appConfig.getTempDir().resolve(jobId).resolve(which + ".pdf");
        if (!Files.exists(pdfPath)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "文件不存在");
        }
        return new FileSystemResource(pdfPath);
    }

    private CompareOptions parseOptions(String optionsJson) {
        try {
            if (optionsJson == null || optionsJson.isBlank()) {
                return new CompareOptions();
            }
            return objectMapper.readValue(optionsJson, CompareOptions.class);
        } catch (Exception ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "options 参数无效: " + ex.getMessage());
        }
    }

    private void validatePdf(MultipartFile file, String message) {
        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_CONTENT_TYPES.contains(contentType)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, message);
        }
    }

    private void saveUpload(MultipartFile file, Path dest) throws IOException {
        byte[] content = file.getBytes();
        if (content.length > appConfig.getMaxUploadSize()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "文件大小超过 50MB 限制");
        }
        Files.write(dest, content);
    }

    private void deleteDirectory(Path dir) {
        if (!Files.exists(dir)) {
            return;
        }
        try (Stream<Path> walk = Files.walk(dir)) {
            walk.sorted(Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException ignored) {
                }
            });
        } catch (IOException ignored) {
        }
    }
}
