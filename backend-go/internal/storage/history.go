package storage

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"github.com/pdfdiff/backend-go/internal/config"
	"github.com/pdfdiff/backend-go/internal/dto"
)

const createTableSQL = `
CREATE TABLE IF NOT EXISTS compare_history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    job_id VARCHAR(36) NOT NULL,
    backend VARCHAR(20) NOT NULL,
    template_url VARCHAR(1024) NOT NULL,
    contract_url VARCHAR(1024) NOT NULL,
    template_name VARCHAR(255) NOT NULL DEFAULT '',
    contract_name VARCHAR(255) NOT NULL DEFAULT '',
    deleted_lines INT NOT NULL DEFAULT 0,
    inserted_lines INT NOT NULL DEFAULT 0,
    modified_lines INT NOT NULL DEFAULT 0,
    equal_lines INT NOT NULL DEFAULT 0,
    result_json LONGTEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`

type HistoryStore struct {
	db          *sql.DB
	backendName string
}

func NewHistoryStore(cfg config.Config) (*HistoryStore, error) {
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/?parseTime=true&charset=utf8mb4",
		cfg.MySQLUser, cfg.MySQLPassword, cfg.MySQLHost, cfg.MySQLPort)
	conn, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}
	if err := conn.Ping(); err != nil {
		conn.Close()
		return nil, err
	}

	if _, err := conn.Exec(fmt.Sprintf("CREATE DATABASE IF NOT EXISTS `%s`", cfg.MySQLDatabase)); err != nil {
		conn.Close()
		return nil, err
	}
	conn.Close()

	db, err := sql.Open("mysql", cfg.MySQLDSN())
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}
	if _, err := db.Exec(createTableSQL); err != nil {
		db.Close()
		return nil, err
	}

	return &HistoryStore{db: db, backendName: cfg.BackendName}, nil
}

func (s *HistoryStore) Close() error {
	if s.db == nil {
		return nil
	}
	return s.db.Close()
}

func (s *HistoryStore) SaveHistory(
	jobID, templateURL, contractURL, templateName, contractName string,
	result dto.CompareResult,
) error {
	resultJSON, err := json.Marshal(result)
	if err != nil {
		return err
	}

	_, err = s.db.Exec(`
		INSERT INTO compare_history (
			job_id, backend, template_url, contract_url,
			template_name, contract_name,
			deleted_lines, inserted_lines, modified_lines, equal_lines,
			result_json
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		jobID, s.backendName, templateURL, contractURL,
		templateName, contractName,
		result.Summary.DeletedLines, result.Summary.InsertedLines,
		result.Summary.ModifiedLines, result.Summary.EqualLines,
		string(resultJSON),
	)
	return err
}

func (s *HistoryStore) ListHistory(limit, offset int) (dto.HistoryListResponse, error) {
	var total int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM compare_history`).Scan(&total); err != nil {
		return dto.HistoryListResponse{}, err
	}

	rows, err := s.db.Query(`
		SELECT id, job_id, backend, template_url, contract_url,
		       template_name, contract_name,
		       deleted_lines, inserted_lines, modified_lines, equal_lines,
		       created_at
		FROM compare_history
		ORDER BY created_at DESC, id DESC
		LIMIT ? OFFSET ?`, limit, offset)
	if err != nil {
		return dto.HistoryListResponse{}, err
	}
	defer rows.Close()

	items := make([]dto.HistoryItem, 0)
	for rows.Next() {
		item, err := scanHistoryItem(rows)
		if err != nil {
			return dto.HistoryListResponse{}, err
		}
		items = append(items, item)
	}
	return dto.HistoryListResponse{Items: items, Total: total}, rows.Err()
}

func (s *HistoryStore) GetHistory(id int64) (*dto.HistoryDetail, error) {
	return s.getHistoryRow(`WHERE id = ?`, id)
}

func (s *HistoryStore) GetHistoryByJobID(jobID string) (*dto.HistoryDetail, error) {
	return s.getHistoryRow(`WHERE job_id = ? ORDER BY id DESC LIMIT 1`, jobID)
}

func (s *HistoryStore) getHistoryRow(whereClause string, arg any) (*dto.HistoryDetail, error) {
	row := s.db.QueryRow(`
		SELECT id, job_id, backend, template_url, contract_url,
		       template_name, contract_name,
		       deleted_lines, inserted_lines, modified_lines, equal_lines,
		       result_json, created_at
		FROM compare_history
		`+whereClause, arg)

	var item dto.HistoryItem
	var resultJSON string
	var createdAt time.Time
	err := row.Scan(
		&item.ID, &item.JobID, &item.Backend, &item.TemplateURL, &item.ContractURL,
		&item.TemplateName, &item.ContractName,
		&item.Summary.DeletedLines, &item.Summary.InsertedLines,
		&item.Summary.ModifiedLines, &item.Summary.EqualLines,
		&resultJSON, &createdAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	item.CreatedAt = createdAt.Format("2006-01-02 15:04:05")

	var result dto.CompareResult
	if err := json.Unmarshal([]byte(resultJSON), &result); err != nil {
		return nil, err
	}
	return &dto.HistoryDetail{HistoryItem: item, Result: result}, nil
}

type historyScanner interface {
	Scan(dest ...any) error
}

func scanHistoryItem(scanner historyScanner) (dto.HistoryItem, error) {
	var item dto.HistoryItem
	var createdAt time.Time
	err := scanner.Scan(
		&item.ID, &item.JobID, &item.Backend, &item.TemplateURL, &item.ContractURL,
		&item.TemplateName, &item.ContractName,
		&item.Summary.DeletedLines, &item.Summary.InsertedLines,
		&item.Summary.ModifiedLines, &item.Summary.EqualLines,
		&createdAt,
	)
	if err != nil {
		return dto.HistoryItem{}, err
	}
	item.CreatedAt = createdAt.Format("2006-01-02 15:04:05")
	return item, nil
}
