package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/pdfdiff/backend-go/internal/config"
	"github.com/pdfdiff/backend-go/internal/handler"
	"github.com/pdfdiff/backend-go/internal/service"
)

func main() {
	cfg := config.Load()
	if err := os.MkdirAll(cfg.TempDir, 0o755); err != nil {
		log.Fatalf("无法创建 temp 目录: %v", err)
	}

	svc := service.NewCompareService(cfg)
	h := handler.NewCompareHandler(svc)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", h.Health)
	mux.HandleFunc("POST /api/compare", h.Compare)
	mux.HandleFunc("GET /api/compare/{jobId}", h.GetResult)
	mux.HandleFunc("GET /api/files/{jobId}/{which}", h.GetPDF)

	addr := ":" + cfg.Port
	fmt.Printf("Golang PDF diff server listening on %s\n", addr)
	if err := http.ListenAndServe(addr, handler.WithCORS(mux)); err != nil {
		log.Fatal(err)
	}
}
