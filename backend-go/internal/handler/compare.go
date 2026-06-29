package handler

import (
	"encoding/json"
	"errors"
	"mime/multipart"
	"net/http"
	"strings"

	"github.com/pdfdiff/backend-go/internal/apperror"
	"github.com/pdfdiff/backend-go/internal/dto"
	"github.com/pdfdiff/backend-go/internal/service"
)

type CompareHandler struct {
	svc *service.CompareService
}

func NewCompareHandler(svc *service.CompareService) *CompareHandler {
	return &CompareHandler{svc: svc}
}

func (h *CompareHandler) Compare(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(100 << 20); err != nil {
		writeError(w, apperror.BadRequest("无法解析上传表单"))
		return
	}

	template, err := readPart(r.MultipartForm, "template")
	if err != nil {
		writeError(w, err)
		return
	}
	contract, err := readPart(r.MultipartForm, "contract")
	if err != nil {
		writeError(w, err)
		return
	}

	optionsJSON := ""
	if values := r.MultipartForm.Value["options"]; len(values) > 0 {
		optionsJSON = values[0]
	}

	resp, err := h.svc.Compare(template, contract, optionsJSON)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
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

	path, err := h.svc.GetPDFPath(jobID, which)
	if err != nil {
		writeError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", "inline; filename=\""+which+".pdf\"")
	http.ServeFile(w, r, path)
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
