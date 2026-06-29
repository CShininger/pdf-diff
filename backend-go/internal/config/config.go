package config

import (
	"os"
	"path/filepath"
	"strconv"
)

const DefaultMaxUploadSize = 50 * 1024 * 1024

type Config struct {
	Port           string
	TempDir        string
	MaxUploadSize  int64
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
	}
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
