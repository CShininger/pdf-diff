package com.pdfdiff.service;

import com.pdfdiff.dto.CompareOptions;
import com.pdfdiff.dto.CompareURLRequest;
import com.pdfdiff.vo.CompareResponse;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

public interface CompareService {

    CompareResponse compareFromUrls(CompareURLRequest request) throws IOException;

    CompareResponse compare(MultipartFile template, MultipartFile contract, String optionsJson) throws IOException;

    CompareResponse getResult(String jobId);
}
