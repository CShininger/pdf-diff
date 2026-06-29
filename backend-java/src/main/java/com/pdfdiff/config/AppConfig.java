package com.pdfdiff.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.nio.file.Path;
import java.nio.file.Paths;

@Configuration
public class AppConfig implements WebMvcConfigurer {

    @Value("${pdf-diff.temp-dir:temp}")
    private String tempDir;

    @Value("${pdf-diff.max-upload-size:52428800}")
    private long maxUploadSize;

    @Value("${pdf-diff.backend:java}")
    private String backendName;

    @Value("${pdf-diff.minio-endpoint:http://10.10.101.52:31102}")
    private String minioEndpoint;

    @Value("${pdf-diff.minio-bucket:demo-test}")
    private String minioBucket;

    public Path getTempDir() {
        return Paths.get(tempDir).toAbsolutePath().normalize();
    }

    public long getMaxUploadSize() {
        return maxUploadSize;
    }

    public String getBackendName() {
        return backendName;
    }

    public String getMinioEndpoint() {
        return minioEndpoint;
    }

    public String getMinioBucket() {
        return minioBucket;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
                .allowedOriginPatterns("*")
                .allowedMethods("*")
                .allowedHeaders("*")
                .allowCredentials(true);
    }
}
