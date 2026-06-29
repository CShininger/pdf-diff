package com.pdfdiff.service;

import com.pdfdiff.dto.DownloadedFile;
import com.pdfdiff.vo.UploadResponse;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

public interface MinioService {

    UploadResponse upload(MultipartFile file) throws IOException;

    DownloadedFile download(String url);
}
