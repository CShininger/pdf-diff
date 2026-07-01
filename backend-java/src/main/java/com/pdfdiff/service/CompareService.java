package com.pdfdiff.service;

import com.pdfdiff.dto.CompareOptions;
import com.pdfdiff.dto.CompareURLRequest;
import com.pdfdiff.vo.CompareResponse;
import com.pdfdiff.vo.CompareResult;
import com.pdfdiff.vo.HistoryDetail;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

public interface CompareService {

    CompareResponse compareFromUrls(CompareURLRequest request) throws IOException;

    CompareResponse compare(MultipartFile template, MultipartFile contract, String optionsJson) throws IOException;

    CompareResponse getResult(String jobId);

    HistoryDetail saveFrontendCompare(
            MultipartFile template,
            MultipartFile contract,
            String templateName,
            String contractName,
            String resultJson
    ) throws IOException;
}
