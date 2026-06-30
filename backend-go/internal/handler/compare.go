package handler

import (
	"encoding/json"
	"errors"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"

	"github.com/pdfdiff/backend-go/internal/apperror"
	"github.com/pdfdiff/backend-go/internal/dto"
	"github.com/pdfdiff/backend-go/internal/service"
	"github.com/pdfdiff/backend-go/internal/storage"
)

type CompareHandler struct {
	svc     *service.CompareService
	minio   *storage.MinioClient
	history *storage.HistoryStore
}

func NewCompareHandler(svc *service.CompareService, minio *storage.MinioClient, history *storage.HistoryStore) *CompareHandler {
	return &CompareHandler{svc: svc, minio: minio, history: history}
}

func (h *CompareHandler) Compare(w http.ResponseWriter, r *http.Request) {
	var req dto.CompareURLRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, apperror.BadRequest("请求体无效"))
		return
	}
	if strings.TrimSpace(req.TemplateURL) == "" || strings.TrimSpace(req.ContractURL) == "" {
		writeError(w, apperror.BadRequest("template_url 和 contract_url 不能为空"))
		return
	}

	resp, err := h.svc.CompareFromURLs(req)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *CompareHandler) Upload(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(100 << 20); err != nil {
		writeError(w, apperror.BadRequest("无法解析上传表单"))
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, apperror.BadRequest("缺少文件: file"))
		return
	}
	defer file.Close()

	content, err := service.ReadUpload(file, h.svc.MaxUploadSize())
	if err != nil {
		writeError(w, err)
		return
	}

	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	url, filename, err := h.minio.Upload(content, header.Filename, contentType)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, dto.UploadResponse{URL: url, Filename: filename})
}

func (h *CompareHandler) ListHistory(w http.ResponseWriter, r *http.Request) {
	if h.history == nil {
		writeError(w, apperror.Internal("历史记录服务不可用"))
		return
	}

	limit := parseIntQuery(r, "limit", 50)
	offset := parseIntQuery(r, "offset", 0)
	if limit < 1 {
		limit = 1
	}
	if limit > 200 {
		limit = 200
	}
	if offset < 0 {
		offset = 0
	}

	resp, err := h.history.ListHistory(limit, offset)
	if err != nil {
		writeError(w, apperror.Internal("读取历史记录失败: "+err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *CompareHandler) GetHistory(w http.ResponseWriter, r *http.Request) {
	if h.history == nil {
		writeError(w, apperror.Internal("历史记录服务不可用"))
		return
	}

	id, err := strconv.ParseInt(r.PathValue("historyId"), 10, 64)
	if err != nil {
		writeError(w, apperror.BadRequest("无效的历史记录 ID"))
		return
	}

	detail, err := h.history.GetHistory(id)
	if err != nil {
		writeError(w, apperror.Internal("读取历史记录失败: "+err.Error()))
		return
	}
	if detail == nil {
		writeError(w, apperror.NotFound("历史记录不存在"))
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

func (h *CompareHandler) GetResult(w http.ResponseWriter, r *http.Request) {
	jobID := r.PathValue("jobId")
	resp, err := h.svc.GetResult(jobID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *CompareHandler) GetPDF(w http.ResponseWriter, r *http.Request) {
	jobID := r.PathValue("jobId")
	which := r.PathValue("which")

	if which != "template" && which != "contract" {
		writeError(w, apperror.BadRequest("which 只能是 template 或 contract"))
		return
	}
	if h.history == nil {
		writeError(w, apperror.NotFound("文件不存在"))
		return
	}

	detail, err := h.history.GetHistoryByJobID(jobID)
	if err != nil {
		writeError(w, apperror.Internal("读取文件信息失败: "+err.Error()))
		return
	}
	if detail == nil {
		writeError(w, apperror.NotFound("文件不存在"))
		return
	}

	pdfURL := detail.TemplateURL
	if which == "contract" {
		pdfURL = detail.ContractURL
	}
	http.Redirect(w, r, pdfURL, http.StatusTemporaryRedirect)
}

func (h *CompareHandler) Health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func readPart(form *multipart.Form, name string) (service.UploadedFile, error) {
	files := form.File[name]
	if len(files) == 0 {
		return service.UploadedFile{}, apperror.BadRequest("缺少文件: " + name)
	}

	fileHeader := files[0]
	file, err := fileHeader.Open()
	if err != nil {
		return service.UploadedFile{}, apperror.BadRequest("无法读取文件: " + name)
	}
	defer file.Close()

	content, err := service.ReadUpload(file, 50<<20)
	if err != nil {
		return service.UploadedFile{}, err
	}

	contentType := fileHeader.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	return service.UploadedFile{Content: content, ContentType: contentType}, nil
}

func parseIntQuery(r *http.Request, key string, fallback int) int {
	raw := r.URL.Query().Get(key)
	if raw == "" {
		return fallback
	}
	v, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return v
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, err error) {
	var apiErr *apperror.APIError
	if errors.As(err, &apiErr) {
		writeJSON(w, apiErr.Status, dto.ErrorResponse{Detail: apiErr.Message})
		return
	}
	writeJSON(w, http.StatusInternalServerError, dto.ErrorResponse{Detail: err.Error()})
}

func WithCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "*")
		if strings.EqualFold(r.Method, http.MethodOptions) {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
