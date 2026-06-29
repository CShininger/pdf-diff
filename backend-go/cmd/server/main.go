package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/pdfdiff/backend-go/internal/config"
	"github.com/pdfdiff/backend-go/internal/handler"
	"github.com/pdfdiff/backend-go/internal/service"
	"github.com/pdfdiff/backend-go/internal/storage"
)

func main() {
	cfg := config.Load()
	if err := os.MkdirAll(cfg.TempDir, 0o755); err != nil {
		log.Fatalf("无法创建 temp 目录: %v", err)
	}

	minioClient := storage.NewMinioClient(cfg)

	var historyStore *storage.HistoryStore
	historyStore, err := storage.NewHistoryStore(cfg)
	if err != nil {
		log.Printf("警告: MySQL 初始化失败: %v", err)
		historyStore = nil
	} else {
		defer historyStore.Close()
	}

	svc := service.NewCompareService(cfg, historyStore, minioClient)
	h := handler.NewCompareHandler(svc, minioClient, historyStore)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", h.Health)
	mux.HandleFunc("POST /api/compare", h.Compare)
	mux.HandleFunc("POST /api/upload", h.Upload)
	mux.HandleFunc("GET /api/history", h.ListHistory)
	mux.HandleFunc("GET /api/history/{historyId}", h.GetHistory)
	mux.HandleFunc("GET /api/compare/{jobId}", h.GetResult)
	mux.HandleFunc("GET /api/files/{jobId}/{which}", h.GetPDF)

	addr := ":" + cfg.Port
	fmt.Printf("Golang PDF diff server listening on %s\n", addr)
	if err := http.ListenAndServe(addr, handler.WithCORS(mux)); err != nil {
		log.Fatal(err)
	}
}
