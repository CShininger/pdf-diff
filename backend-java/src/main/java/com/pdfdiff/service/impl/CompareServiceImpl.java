package com.pdfdiff.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdfdiff.common.AppConstants;
import com.pdfdiff.common.AppConstants;
import com.pdfdiff.config.AppConfig;
import com.pdfdiff.dto.CompareOptions;
import com.pdfdiff.dto.CompareURLRequest;
import com.pdfdiff.dto.DownloadedFile;
import com.pdfdiff.exception.ApiException;
import com.pdfdiff.model.LineUnit;
import com.pdfdiff.model.RawChange;
import com.pdfdiff.model.TextBlock;
import com.pdfdiff.service.CompareService;
import com.pdfdiff.service.DiffEngine;
import com.pdfdiff.service.HistoryService;
import com.pdfdiff.service.LineService;
import com.pdfdiff.service.MinioService;
import com.pdfdiff.service.PdfExtractService;
import com.pdfdiff.service.ResultMapper;
import com.pdfdiff.vo.CompareResponse;
import com.pdfdiff.vo.CompareResult;
import com.pdfdiff.vo.HistoryDetail;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

@Service
public class CompareServiceImpl implements CompareService {

    private final AppConfig appConfig;
    private final ObjectMapper objectMapper;
    private final PdfExtractService pdfExtractService;
    private final LineService lineService;
    private final DiffEngine diffEngine;
    private final ResultMapper resultMapper;
    private final MinioService minioService;
    private final HistoryService historyService;

    public CompareServiceImpl(
            AppConfig appConfig,
            ObjectMapper objectMapper,
            PdfExtractService pdfExtractService,
            LineService lineService,
            DiffEngine diffEngine,
            ResultMapper resultMapper,
            MinioService minioService,
            HistoryService historyService
    ) {
        this.appConfig = appConfig;
        this.objectMapper = objectMapper;
        this.pdfExtractService = pdfExtractService;
        this.lineService = lineService;
        this.diffEngine = diffEngine;
        this.resultMapper = resultMapper;
        this.minioService = minioService;
        this.historyService = historyService;
    }

    @Override
    public CompareResponse compareFromUrls(CompareURLRequest request) throws IOException {
        if (request.templateUrl() == null || request.templateUrl().isBlank()
                || request.contractUrl() == null || request.contractUrl().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "template_url 和 contract_url 不能为空");
        }

        DownloadedFile template = minioService.download(request.templateUrl());
        DownloadedFile contract = minioService.download(request.contractUrl());

        validatePdfContentType(template.contentType(), "模版文件必须是 PDF");
        validatePdfContentType(contract.contentType(), "正式文件必须是 PDF");

        CompareResponse response = compareBytes(
                template.content(),
                contract.content(),
                request.options()
        );

        if (response.result() != null) {
            historyService.saveHistory(
                    appConfig.getBackendName(),
                    response.jobId(),
                    request.templateUrl(),
                    request.contractUrl(),
                    request.templateName(),
                    request.contractName(),
                    response.result()
            );
        }
        return response;
    }

    @Override
    public CompareResponse compare(MultipartFile template, MultipartFile contract, String optionsJson)
            throws IOException {
        validatePdf(template, "模版文件必须是 PDF");
        validatePdf(contract, "正式文件必须是 PDF");

        CompareOptions options = parseOptions(optionsJson);
        return compareBytes(template.getBytes(), contract.getBytes(), options);
    }

    private CompareResponse compareBytes(byte[] templateContent, byte[] contractContent, CompareOptions options)
            throws IOException {
        String jobId = UUID.randomUUID().toString();
        Path jobDir = appConfig.getTempDir().resolve(jobId);
        Files.createDirectories(jobDir);

        try {
            Path templatePath = jobDir.resolve("template.pdf");
            Path contractPath = jobDir.resolve("contract.pdf");

            saveBytes(templateContent, templatePath);
            saveBytes(contractContent, contractPath);

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

            return CompareResponse.done(jobId, result);
        } catch (ApiException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "比对失败: " + ex.getMessage());
        } finally {
            deleteDirectory(jobDir);
        }
    }

    @Override
    public CompareResponse getResult(String jobId) {
        HistoryDetail detail = historyService.getHistoryByJobId(jobId);
        if (detail == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "任务不存在或已过期");
        }
        return CompareResponse.done(jobId, detail.result());
    }

    @Override
    public HistoryDetail saveFrontendCompare(
            MultipartFile template,
            MultipartFile contract,
            String templateName,
            String contractName,
            String resultJson
    ) throws IOException {
        validatePdf(template, "模版文件必须是 PDF");
        validatePdf(contract, "正式文件必须是 PDF");

        if (resultJson == null || resultJson.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "result 不能为空");
        }

        CompareResult result;
        try {
            result = objectMapper.readValue(resultJson, CompareResult.class);
        } catch (Exception ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "result 格式无效: " + ex.getMessage());
        }

        if (result.summary() == null || result.changes() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "result 缺少必要字段");
        }

        var templateUpload = minioService.upload(template);
        var contractUpload = minioService.upload(contract);

        String jobId = result.jobId() != null && !result.jobId().isBlank()
                ? result.jobId()
                : UUID.randomUUID().toString();

        CompareResult storedResult = jobId.equals(result.jobId())
                ? result
                : new CompareResult(
                        jobId,
                        result.summary(),
                        result.changes(),
                        result.templateLines(),
                        result.contractLines()
                );

        historyService.saveHistory(
                AppConstants.BACKEND_FRONTEND,
                jobId,
                templateUpload.url(),
                contractUpload.url(),
                defaultName(templateName, template.getOriginalFilename(), "模版 PDF"),
                defaultName(contractName, contract.getOriginalFilename(), "正式 PDF"),
                storedResult
        );

        HistoryDetail detail = historyService.getHistoryByJobId(jobId);
        if (detail == null) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "保存历史记录失败");
        }
        return detail;
    }

    private static String defaultName(String preferred, String fallback, String defaultValue) {
        if (preferred != null && !preferred.isBlank()) {
            return preferred;
        }
        if (fallback != null && !fallback.isBlank()) {
            return fallback;
        }
        return defaultValue;
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
        validatePdfContentType(file.getContentType(), message);
    }

    private void validatePdfContentType(String contentType, String message) {
        if (contentType == null || !AppConstants.ALLOWED_CONTENT_TYPES.contains(contentType)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, message);
        }
    }

    private void saveBytes(byte[] content, Path dest) throws IOException {
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
