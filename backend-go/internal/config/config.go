package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
)

const DefaultMaxUploadSize = 50 * 1024 * 1024

type Config struct {
	Port           string
	TempDir        string
	MaxUploadSize  int64
	MinioEndpoint  string
	MinioBucket    string
	MySQLHost      string
	MySQLPort      string
	MySQLUser      string
	MySQLPassword  string
	MySQLDatabase  string
	BackendName    string
}

func (c Config) MySQLDSN() string {
	return fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true&charset=utf8mb4",
		c.MySQLUser, c.MySQLPassword, c.MySQLHost, c.MySQLPort, c.MySQLDatabase)
}

func Load() Config {
	tempDir := getenv("PDF_DIFF_TEMP_DIR", "temp")
	maxUpload := int64(DefaultMaxUploadSize)
	if raw := os.Getenv("PDF_DIFF_MAX_UPLOAD_SIZE"); raw != "" {
		if v, err := strconv.ParseInt(raw, 10, 64); err == nil {
			maxUpload = v
		}
	}

	absTemp, err := filepath.Abs(tempDir)
	if err != nil {
		absTemp = tempDir
	}

	return Config{
		Port:          getenv("PORT", "8002"),
		TempDir:       absTemp,
		MaxUploadSize: maxUpload,
		MinioEndpoint: getenv("MINIO_ENDPOINT", "http://10.10.101.52:31102"),
		MinioBucket:   getenv("MINIO_BUCKET", "demo-test"),
		MySQLHost:     getenv("MYSQL_HOST", "localhost"),
		MySQLPort:     getenv("MYSQL_PORT", "3306"),
		MySQLUser:     getenv("MYSQL_USER", "test"),
		MySQLPassword: getenv("MYSQL_PASSWORD", "test"),
		MySQLDatabase: getenv("MYSQL_DATABASE", "mydb"),
		BackendName:   getenv("PDF_DIFF_BACKEND", "go"),
	}
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
