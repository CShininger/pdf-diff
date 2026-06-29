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

	templatePath := filepath.Join(jobDir, "template.pdf")
	contractPath := filepath.Join(jobDir, "contract.pdf")
	resultPath := filepath.Join(jobDir, "result.json")

	cleanup := func() { _ = os.RemoveAll(jobDir) }

	if err := saveUpload(template.Content, templatePath, s.cfg.MaxUploadSize); err != nil {
		cleanup()
		return dto.CompareResponse{}, dto.CompareResult{}, err
	}
	if err := saveUpload(contract.Content, contractPath, s.cfg.MaxUploadSize); err != nil {
		cleanup()
		return dto.CompareResponse{}, dto.CompareResult{}, err
	}

	templateBlocks, err := ExtractTextBlocks(templatePath, options.IgnoreHeaderFooter)
	if err != nil {
		cleanup()
		return dto.CompareResponse{}, dto.CompareResult{}, apperror.Internal("比对失败: " + err.Error())
	}
	contractBlocks, err := ExtractTextBlocks(contractPath, options.IgnoreHeaderFooter)
	if err != nil {
		cleanup()
		return dto.CompareResponse{}, dto.CompareResult{}, apperror.Internal("比对失败: " + err.Error())
	}

	templateLines := BlocksToLines(templateBlocks, "tpl", options.IgnoreWhitespace)
	contractLines := BlocksToLines(contractBlocks, "con", options.IgnoreWhitespace)
	rawChanges := DiffLines(templateLines, contractLines)
	result := BuildCompareResult(jobID, templateLines, contractLines, rawChanges)

	data, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		cleanup()
		return dto.CompareResponse{}, dto.CompareResult{}, apperror.Internal("比对失败: " + err.Error())
	}
	if err := os.WriteFile(resultPath, data, 0o644); err != nil {
		cleanup()
		return dto.CompareResponse{}, dto.CompareResult{}, apperror.Internal("比对失败: " + err.Error())
	}

	return dto.DoneResponse(jobID, result), result, nil
}

func (s *CompareService) MaxUploadSize() int64 {
	return s.cfg.MaxUploadSize
}

func (s *CompareService) GetResult(jobID string) (dto.CompareResponse, error) {
	resultPath := filepath.Join(s.cfg.TempDir, jobID, "result.json")
	data, err := os.ReadFile(resultPath)
	if err != nil {
		if os.IsNotExist(err) {
			return dto.CompareResponse{}, apperror.NotFound("任务不存在或已过期")
		}
		return dto.CompareResponse{}, apperror.Internal("读取结果失败: " + err.Error())
	}

	var result dto.CompareResult
	if err := json.Unmarshal(data, &result); err != nil {
		return dto.CompareResponse{}, apperror.Internal("解析结果失败: " + err.Error())
	}
	return dto.DoneResponse(jobID, result), nil
}

func (s *CompareService) GetPDFPath(jobID, which string) (string, error) {
	if which != "template" && which != "contract" {
		return "", apperror.BadRequest("which 只能是 template 或 contract")
	}
	pdfPath := filepath.Join(s.cfg.TempDir, jobID, which+".pdf")
	if _, err := os.Stat(pdfPath); err != nil {
		if os.IsNotExist(err) {
			return "", apperror.NotFound("文件不存在")
		}
		return "", apperror.Internal(err.Error())
	}
	return pdfPath, nil
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
