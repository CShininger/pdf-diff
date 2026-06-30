package com.pdfdiff.controller;

import com.pdfdiff.dto.CompareURLRequest;
import com.pdfdiff.exception.ApiException;
import com.pdfdiff.service.CompareService;
import com.pdfdiff.service.HistoryService;
import com.pdfdiff.service.MinioService;
import com.pdfdiff.vo.CompareResponse;
import com.pdfdiff.vo.HistoryDetail;
import com.pdfdiff.vo.HistoryListResponse;
import com.pdfdiff.vo.UploadResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.URI;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api")
public class CompareController {

    private final CompareService compareService;
    private final MinioService minioService;
    private final HistoryService historyService;

    public CompareController(
            CompareService compareService,
            MinioService minioService,
            HistoryService historyService) {
        this.compareService = compareService;
        this.minioService = minioService;
        this.historyService = historyService;
    }

    @PostMapping(value = "/compare", consumes = MediaType.APPLICATION_JSON_VALUE)
    public CompareResponse compare(@RequestBody CompareURLRequest request) throws IOException {
        return compareService.compareFromUrls(request);
    }

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public UploadResponse upload(@RequestPart("file") MultipartFile file) throws IOException {
        return minioService.upload(file);
    }

    @GetMapping("/history")
    public HistoryListResponse listHistory(
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(defaultValue = "0") int offset) {
        if (limit < 1) {
            limit = 1;
        }
        if (limit > 200) {
            limit = 200;
        }
        if (offset < 0) {
            offset = 0;
        }
        return historyService.listHistory(limit, offset);
    }

    @GetMapping("/history/{historyId}")
    public HistoryDetail getHistory(@PathVariable long historyId) {
        return historyService.getHistory(historyId);
    }

    @GetMapping("/compare/{jobId}")
    public CompareResponse getCompareResult(@PathVariable String jobId) {
        return compareService.getResult(jobId);
    }

    @GetMapping("/files/{jobId}/{which}")
    public ResponseEntity<Void> getPdfFile(
            @PathVariable String jobId,
            @PathVariable String which) {
        if (!Set.of("template", "contract").contains(which)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "which 只能是 template 或 contract");
        }

        var detail = historyService.getHistoryByJobId(jobId);
        if (detail == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "文件不存在");
        }

        String pdfUrl = "template".equals(which) ? detail.templateUrl() : detail.contractUrl();
        return ResponseEntity.status(HttpStatus.TEMPORARY_REDIRECT)
                .location(URI.create(pdfUrl))
                .build();
    }
}

@RestController
class HealthController {

    @GetMapping("/health")
    Map<String, String> health() {
        return Map.of("status", "ok");
    }
}
