package com.pdfdiff.controller;

import com.pdfdiff.dto.CompareResponse;
import com.pdfdiff.service.CompareService;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class CompareController {

    private final CompareService compareService;

    public CompareController(CompareService compareService) {
        this.compareService = compareService;
    }

    @PostMapping(value = "/compare", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public CompareResponse compare(
            @RequestPart("template") MultipartFile template,
            @RequestPart("contract") MultipartFile contract,
            @RequestPart(value = "options", required = false) String options
    ) throws IOException {
        return compareService.compare(template, contract, options);
    }

    @GetMapping("/compare/{jobId}")
    public CompareResponse getCompareResult(@PathVariable String jobId) throws IOException {
        return compareService.getResult(jobId);
    }

    @GetMapping("/files/{jobId}/{which}")
    public ResponseEntity<Resource> getPdfFile(
            @PathVariable String jobId,
            @PathVariable String which
    ) {
        Resource resource = compareService.getPdfFile(jobId, which);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + which + ".pdf\"")
                .body(resource);
    }
}

@RestController
class HealthController {

    @GetMapping("/health")
    Map<String, String> health() {
        return Map.of("status", "ok");
    }
}
