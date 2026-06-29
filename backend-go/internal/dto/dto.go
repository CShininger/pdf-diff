package dto

type CompareOptions struct {
	IgnoreWhitespace   bool `json:"ignore_whitespace"`
	IgnoreHeaderFooter bool `json:"ignore_header_footer"`
}

type SideInfo struct {
	Page   int         `json:"page"`
	Text   string      `json:"text"`
	BBoxes [][]float64 `json:"bboxes"`
}

type ChangeItem struct {
	ID       string    `json:"id"`
	Type     string    `json:"type"`
	Level    string    `json:"level"`
	Template *SideInfo `json:"template,omitempty"`
	Contract *SideInfo `json:"contract,omitempty"`
}

type LineInfo struct {
	ID     string      `json:"id"`
	Page   int         `json:"page"`
	Text   string      `json:"text"`
	BBoxes [][]float64 `json:"bboxes"`
}

type CompareSummary struct {
	DeletedLines  int `json:"deleted_lines"`
	InsertedLines int `json:"inserted_lines"`
	ModifiedLines int `json:"modified_lines"`
	EqualLines    int `json:"equal_lines"`
}

type CompareResult struct {
	JobID         string         `json:"job_id"`
	Status        string         `json:"status"`
	Summary       CompareSummary `json:"summary"`
	Changes       []ChangeItem   `json:"changes"`
	TemplateLines []LineInfo     `json:"template_lines"`
	ContractLines []LineInfo     `json:"contract_lines"`
}

type CompareResponse struct {
	JobID   string         `json:"job_id"`
	Status  string         `json:"status"`
	Result  *CompareResult `json:"result,omitempty"`
	Message *string        `json:"message,omitempty"`
}

type ErrorResponse struct {
	Detail string `json:"detail"`
}

func DoneResponse(jobID string, result CompareResult) CompareResponse {
	return CompareResponse{JobID: jobID, Status: "done", Result: &result}
}

type CompareURLRequest struct {
	TemplateURL   string         `json:"template_url"`
	ContractURL   string         `json:"contract_url"`
	TemplateName  string         `json:"template_name"`
	ContractName  string         `json:"contract_name"`
	Options       CompareOptions `json:"options"`
}

type UploadResponse struct {
	URL      string `json:"url"`
	Filename string `json:"filename"`
}

type HistoryItem struct {
	ID           int64          `json:"id"`
	JobID        string         `json:"job_id"`
	Backend      string         `json:"backend"`
	TemplateURL  string         `json:"template_url"`
	ContractURL  string         `json:"contract_url"`
	TemplateName string         `json:"template_name"`
	ContractName string         `json:"contract_name"`
	Summary      CompareSummary `json:"summary"`
	CreatedAt    string         `json:"created_at"`
}

type HistoryDetail struct {
	HistoryItem
	Result CompareResult `json:"result"`
}

type HistoryListResponse struct {
	Items []HistoryItem `json:"items"`
	Total int           `json:"total"`
}
