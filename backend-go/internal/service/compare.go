package service

import (
	"encoding/json"
	"io"
	"os"
	"path/filepath"

	"github.com/google/uuid"
	"github.com/pdfdiff/backend-go/internal/apperror"
	"github.com/pdfdiff/backend-go/internal/config"
	"github.com/pdfdiff/backend-go/internal/dto"
	"github.com/pdfdiff/backend-go/internal/storage"
)

var allowedContentTypes = map[string]struct{}{
	"application/pdf":      {},
	"application/octet-stream": {},
}

type CompareService struct {
	cfg     config.Config
	history *storage.HistoryStore
	minio   *storage.MinioClient
}

func NewCompareService(cfg config.Config, history *storage.HistoryStore, minio *storage.MinioClient) *CompareService {
	return &CompareService{cfg: cfg, history: history, minio: minio}
}

type UploadedFile struct {
	Content     []byte
	ContentType string
}

func (s *CompareService) CompareFromURLs(req dto.CompareURLRequest) (dto.CompareResponse, error) {
	templateContent, templateType, err := s.minio.Download(req.TemplateURL)
	if err != nil {
		return dto.CompareResponse{}, err
	}
	contractContent, contractType, err := s.minio.Download(req.ContractURL)
	if err != nil {
		return dto.CompareResponse{}, err
	}

	template := UploadedFile{Content: templateContent, ContentType: templateType}
	contract := UploadedFile{Content: contractContent, ContentType: contractType}

	options := req.Options
	if options == (dto.CompareOptions{}) {
		options = dto.CompareOptions{IgnoreWhitespace: true, IgnoreHeaderFooter: true}
	}
	optionsJSON, err := json.Marshal(options)
	if err != nil {
		return dto.CompareResponse{}, apperror.BadRequest("options 参数无效")
	}

	resp, result, err := s.compareFiles(template, contract, string(optionsJSON))
	if err != nil {
		return dto.CompareResponse{}, err
	}

	if s.history != nil {
		_ = s.history.SaveHistory(
			resp.JobID,
			req.TemplateURL,
			req.ContractURL,
			req.TemplateName,
			req.ContractName,
			result,
		)
	}
	return resp, nil
}

func (s *CompareService) Compare(template, contract UploadedFile, optionsJSON string) (dto.CompareResponse, error) {
	resp, _, err := s.compareFiles(template, contract, optionsJSON)
	return resp, err
}

func (s *CompareService) compareFiles(template, contract UploadedFile, optionsJSON string) (dto.CompareResponse, dto.CompareResult, error) {
	if err := validatePDF(template.ContentType, "模版文件必须是 PDF"); err != nil {
		return dto.CompareResponse{}, dto.CompareResult{}, err
	}
	if err := validatePDF(contract.ContentType, "正式文件必须是 PDF"); err != nil {
		return dto.CompareResponse{}, dto.CompareResult{}, err
	}

	options, err := parseOptions(optionsJSON)
	if err != nil {
		return dto.CompareResponse{}, dto.CompareResult{}, err
	}

	jobID := uuid.New().String()
	jobDir := filepath.Join(s.cfg.TempDir, jobID)

	if err := os.MkdirAll(jobDir, 0o755); err != nil {
		return dto.CompareResponse{}, dto.CompareResult{}, apperror.Internal("比对失败: " + err.Error())
	}
	defer func() { _ = os.RemoveAll(jobDir) }()

	templatePath := filepath.Join(jobDir, "template.pdf")
	contractPath := filepath.Join(jobDir, "contract.pdf")

	if err := saveUpload(template.Content, templatePath, s.cfg.MaxUploadSize); err != nil {
		return dto.CompareResponse{}, dto.CompareResult{}, err
	}
	if err := saveUpload(contract.Content, contractPath, s.cfg.MaxUploadSize); err != nil {
		return dto.CompareResponse{}, dto.CompareResult{}, err
	}

	templateBlocks, err := ExtractTextBlocks(templatePath, options.IgnoreHeaderFooter)
	if err != nil {
		return dto.CompareResponse{}, dto.CompareResult{}, apperror.Internal("比对失败: " + err.Error())
	}
	contractBlocks, err := ExtractTextBlocks(contractPath, options.IgnoreHeaderFooter)
	if err != nil {
		return dto.CompareResponse{}, dto.CompareResult{}, apperror.Internal("比对失败: " + err.Error())
	}

	templateLines := BlocksToLines(templateBlocks, "tpl", options.IgnoreWhitespace)
	contractLines := BlocksToLines(contractBlocks, "con", options.IgnoreWhitespace)
	rawChanges := DiffLines(templateLines, contractLines)
	result := BuildCompareResult(jobID, templateLines, contractLines, rawChanges)

	return dto.DoneResponse(jobID, result), result, nil
}

func (s *CompareService) MaxUploadSize() int64 {
	return s.cfg.MaxUploadSize
}

func (s *CompareService) GetResult(jobID string) (dto.CompareResponse, error) {
	if s.history == nil {
		return dto.CompareResponse{}, apperror.NotFound("任务不存在或已过期")
	}

	detail, err := s.history.GetHistoryByJobID(jobID)
	if err != nil {
		return dto.CompareResponse{}, apperror.Internal("读取比对结果失败: " + err.Error())
	}
	if detail == nil {
		return dto.CompareResponse{}, apperror.NotFound("任务不存在或已过期")
	}
	return dto.DoneResponse(jobID, detail.Result), nil
}

func parseOptions(optionsJSON string) (dto.CompareOptions, error) {
	options := dto.CompareOptions{
		IgnoreWhitespace:   true,
		IgnoreHeaderFooter: true,
	}
	if optionsJSON == "" {
		return options, nil
	}
	if err := json.Unmarshal([]byte(optionsJSON), &options); err != nil {
		return options, apperror.BadRequest("options 参数无效: " + err.Error())
	}
	return options, nil
}

func validatePDF(contentType, message string) error {
	if _, ok := allowedContentTypes[contentType]; !ok {
		return apperror.BadRequest(message)
	}
	return nil
}

func saveUpload(content []byte, dest string, maxSize int64) error {
	if int64(len(content)) > maxSize {
		return apperror.BadRequest("文件大小超过 50MB 限制")
	}
	return os.WriteFile(dest, content, 0o644)
}

func ReadUpload(r io.Reader, maxSize int64) ([]byte, error) {
	limited := io.LimitReader(r, maxSize+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > maxSize {
		return nil, apperror.BadRequest("文件大小超过 50MB 限制")
	}
	return data, nil
}
