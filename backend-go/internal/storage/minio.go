package storage

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/pdfdiff/backend-go/internal/apperror"
	"github.com/pdfdiff/backend-go/internal/config"
)

type MinioClient struct {
	endpoint  string
	bucket    string
	maxSize   int64
	httpClient *http.Client
}

func NewMinioClient(cfg config.Config) *MinioClient {
	return &MinioClient{
		endpoint: strings.TrimRight(cfg.MinioEndpoint, "/"),
		bucket:   cfg.MinioBucket,
		maxSize:  cfg.MaxUploadSize,
		httpClient: &http.Client{Timeout: 120 * time.Second},
	}
}

func (m *MinioClient) PublicURL(objectKey string) string {
	return fmt.Sprintf("%s/%s/%s", m.endpoint, m.bucket, objectKey)
}

func (m *MinioClient) Upload(content []byte, filename, contentType string) (string, string, error) {
	if int64(len(content)) > m.maxSize {
		return "", "", apperror.BadRequest("文件大小超过 50MB 限制")
	}

	safeName := strings.NewReplacer("/", "_", "\\", "_").Replace(filename)
	if safeName == "" {
		safeName = "file.pdf"
	}
	objectKey := uuid.New().String() + "-" + safeName
	url := m.PublicURL(objectKey)

	if contentType == "" {
		contentType = "application/octet-stream"
	}

	req, err := http.NewRequest(http.MethodPut, url, bytes.NewReader(content))
	if err != nil {
		return "", "", apperror.Internal("MinIO 上传失败: " + err.Error())
	}
	req.Header.Set("Content-Type", contentType)

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return "", "", apperror.BadRequest("无法连接 MinIO: " + err.Error())
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return "", "", apperror.BadRequest(fmt.Sprintf("MinIO 上传失败: HTTP %d %s", resp.StatusCode, string(body)))
	}

	return url, objectKey, nil
}

func (m *MinioClient) Download(url string) ([]byte, string, error) {
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, "", apperror.Internal("下载文件失败: " + err.Error())
	}

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return nil, "", apperror.BadRequest("无法下载文件: " + err.Error())
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, "", apperror.BadRequest(fmt.Sprintf("下载文件失败: HTTP %d", resp.StatusCode))
	}

	limited := io.LimitReader(resp.Body, m.maxSize+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return nil, "", apperror.Internal("读取文件失败: " + err.Error())
	}
	if int64(len(data)) > m.maxSize {
		return nil, "", apperror.BadRequest("文件大小超过 50MB 限制")
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	return data, contentType, nil
}
