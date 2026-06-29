package com.pdfdiff.service;

import com.pdfdiff.config.AppConfig;
import com.pdfdiff.dto.UploadResponse;
import com.pdfdiff.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.UUID;

@Service
public class MinioService {

    private final AppConfig appConfig;
    private final HttpClient httpClient;

    public MinioService(AppConfig appConfig) {
        this.appConfig = appConfig;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(30))
                .build();
    }

    public UploadResponse upload(MultipartFile file) throws IOException {
        byte[] content = file.getBytes();
        if (content.length > appConfig.getMaxUploadSize()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "文件大小超过 50MB 限制");
        }

        String filename = file.getOriginalFilename();
        if (filename == null || filename.isBlank()) {
            filename = "file.pdf";
        }
        String safeName = filename.replace("/", "_").replace("\\", "_");
        String objectKey = UUID.randomUUID().toString().replace("-", "") + "-" + safeName;
        String url = publicUrl(objectKey);

        String contentType = file.getContentType();
        if (contentType == null || contentType.isBlank()) {
            contentType = "application/octet-stream";
        }

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(120))
                .header("Content-Type", contentType)
                .PUT(HttpRequest.BodyPublishers.ofByteArray(content))
                .build();

        try {
            HttpResponse<Void> response = httpClient.send(request, HttpResponse.BodyHandlers.discarding());
            if (response.statusCode() >= 400) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "MinIO 上传失败: HTTP " + response.statusCode());
            }
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "MinIO 上传失败: " + ex.getMessage());
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "无法连接 MinIO: " + ex.getMessage());
        }

        return new UploadResponse(url, objectKey);
    }

    public DownloadedFile download(String url) {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(120))
                .GET()
                .build();

        try {
            HttpResponse<byte[]> response = httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() >= 400) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "下载文件失败: HTTP " + response.statusCode());
            }
            byte[] content = response.body();
            if (content.length > appConfig.getMaxUploadSize()) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "文件大小超过 50MB 限制");
            }
            String contentType = response.headers().firstValue("Content-Type").orElse("application/octet-stream");
            return new DownloadedFile(content, contentType);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "下载文件失败: " + ex.getMessage());
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "无法下载文件: " + ex.getMessage());
        }
    }

    private String publicUrl(String objectKey) {
        String endpoint = appConfig.getMinioEndpoint().replaceAll("/+$", "");
        return endpoint + "/" + appConfig.getMinioBucket() + "/" + objectKey;
    }

    public record DownloadedFile(byte[] content, String contentType) {}
}
