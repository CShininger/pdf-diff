package com.pdfdiff.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdfdiff.config.AppConfig;
import com.pdfdiff.dto.CompareResult;
import com.pdfdiff.dto.CompareSummary;
import com.pdfdiff.dto.HistoryDetail;
import com.pdfdiff.dto.HistoryItem;
import com.pdfdiff.dto.HistoryListResponse;
import com.pdfdiff.exception.ApiException;
import jakarta.annotation.PostConstruct;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.util.List;

@Service
public class HistoryService {

    private static final String CREATE_TABLE_SQL = """
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
            """;

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final AppConfig appConfig;

    public HistoryService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper, AppConfig appConfig) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.appConfig = appConfig;
    }

    @PostConstruct
    public void init() {
        jdbcTemplate.execute(CREATE_TABLE_SQL);
    }

    public void saveHistory(
            String jobId,
            String templateUrl,
            String contractUrl,
            String templateName,
            String contractName,
            CompareResult result
    ) {
        try {
            String resultJson = objectMapper.writeValueAsString(result);
            jdbcTemplate.update("""
                    INSERT INTO compare_history (
                        job_id, backend, template_url, contract_url,
                        template_name, contract_name,
                        deleted_lines, inserted_lines, modified_lines, equal_lines,
                        result_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    jobId,
                    appConfig.getBackendName(),
                    templateUrl,
                    contractUrl,
                    templateName,
                    contractName,
                    result.summary().deletedLines(),
                    result.summary().insertedLines(),
                    result.summary().modifiedLines(),
                    result.summary().equalLines(),
                    resultJson
            );
        } catch (Exception ignored) {
        }
    }

    public HistoryListResponse listHistory(int limit, int offset) {
        Integer total = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM compare_history", Integer.class);
        if (total == null) {
            total = 0;
        }

        List<HistoryItem> items = jdbcTemplate.query("""
                SELECT id, job_id, backend, template_url, contract_url,
                       template_name, contract_name,
                       deleted_lines, inserted_lines, modified_lines, equal_lines,
                       created_at
                FROM compare_history
                ORDER BY created_at DESC, id DESC
                LIMIT ? OFFSET ?
                """, (rs, rowNum) -> new HistoryItem(
                rs.getLong("id"),
                rs.getString("job_id"),
                rs.getString("backend"),
                rs.getString("template_url"),
                rs.getString("contract_url"),
                rs.getString("template_name"),
                rs.getString("contract_name"),
                new CompareSummary(
                        rs.getInt("deleted_lines"),
                        rs.getInt("inserted_lines"),
                        rs.getInt("modified_lines"),
                        rs.getInt("equal_lines")
                ),
                formatTimestamp(rs.getTimestamp("created_at"))
        ), limit, offset);

        return new HistoryListResponse(items, total);
    }

    public HistoryDetail getHistory(long id) {
        List<HistoryDetail> rows = jdbcTemplate.query("""
                SELECT id, job_id, backend, template_url, contract_url,
                       template_name, contract_name,
                       deleted_lines, inserted_lines, modified_lines, equal_lines,
                       result_json, created_at
                FROM compare_history
                WHERE id = ?
                """, (rs, rowNum) -> {
            try {
                CompareResult result = objectMapper.readValue(rs.getString("result_json"), CompareResult.class);
                return new HistoryDetail(
                        rs.getLong("id"),
                        rs.getString("job_id"),
                        rs.getString("backend"),
                        rs.getString("template_url"),
                        rs.getString("contract_url"),
                        rs.getString("template_name"),
                        rs.getString("contract_name"),
                        new CompareSummary(
                                rs.getInt("deleted_lines"),
                                rs.getInt("inserted_lines"),
                                rs.getInt("modified_lines"),
                                rs.getInt("equal_lines")
                        ),
                        formatTimestamp(rs.getTimestamp("created_at")),
                        result
                );
            } catch (Exception ex) {
                throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "解析历史记录失败: " + ex.getMessage());
            }
        }, id);

        if (rows.isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "历史记录不存在");
        }
        return rows.get(0);
    }

    private static String formatTimestamp(Timestamp timestamp) {
        if (timestamp == null) {
            return "";
        }
        return timestamp.toLocalDateTime().toString().replace('T', ' ');
    }
}
