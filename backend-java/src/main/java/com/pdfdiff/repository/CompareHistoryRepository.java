package com.pdfdiff.repository;

import com.pdfdiff.entity.CompareHistory;
import jakarta.annotation.PostConstruct;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public class CompareHistoryRepository {

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

    private static final RowMapper<CompareHistory> SUMMARY_ROW_MAPPER = (rs, rowNum) -> new CompareHistory(
            rs.getLong("id"),
            rs.getString("job_id"),
            rs.getString("backend"),
            rs.getString("template_url"),
            rs.getString("contract_url"),
            rs.getString("template_name"),
            rs.getString("contract_name"),
            rs.getInt("deleted_lines"),
            rs.getInt("inserted_lines"),
            rs.getInt("modified_lines"),
            rs.getInt("equal_lines"),
            null,
            toLocalDateTime(rs.getTimestamp("created_at"))
    );

    private static final RowMapper<CompareHistory> DETAIL_ROW_MAPPER = (rs, rowNum) -> new CompareHistory(
            rs.getLong("id"),
            rs.getString("job_id"),
            rs.getString("backend"),
            rs.getString("template_url"),
            rs.getString("contract_url"),
            rs.getString("template_name"),
            rs.getString("contract_name"),
            rs.getInt("deleted_lines"),
            rs.getInt("inserted_lines"),
            rs.getInt("modified_lines"),
            rs.getInt("equal_lines"),
            rs.getString("result_json"),
            toLocalDateTime(rs.getTimestamp("created_at"))
    );

    private final JdbcTemplate jdbcTemplate;

    public CompareHistoryRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostConstruct
    public void init() {
        jdbcTemplate.execute(CREATE_TABLE_SQL);
    }

    public void insert(
            String jobId,
            String backend,
            String templateUrl,
            String contractUrl,
            String templateName,
            String contractName,
            int deletedLines,
            int insertedLines,
            int modifiedLines,
            int equalLines,
            String resultJson
    ) {
        jdbcTemplate.update("""
                INSERT INTO compare_history (
                    job_id, backend, template_url, contract_url,
                    template_name, contract_name,
                    deleted_lines, inserted_lines, modified_lines, equal_lines,
                    result_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                jobId,
                backend,
                templateUrl,
                contractUrl,
                templateName,
                contractName,
                deletedLines,
                insertedLines,
                modifiedLines,
                equalLines,
                resultJson
        );
    }

    public int countAll() {
        Integer total = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM compare_history", Integer.class);
        return total == null ? 0 : total;
    }

    public List<CompareHistory> findSummaries(int limit, int offset) {
        return jdbcTemplate.query("""
                SELECT id, job_id, backend, template_url, contract_url,
                       template_name, contract_name,
                       deleted_lines, inserted_lines, modified_lines, equal_lines,
                       created_at
                FROM compare_history
                ORDER BY created_at DESC, id DESC
                LIMIT ? OFFSET ?
                """, SUMMARY_ROW_MAPPER, limit, offset);
    }

    public Optional<CompareHistory> findById(long id) {
        List<CompareHistory> rows = jdbcTemplate.query("""
                SELECT id, job_id, backend, template_url, contract_url,
                       template_name, contract_name,
                       deleted_lines, inserted_lines, modified_lines, equal_lines,
                       result_json, created_at
                FROM compare_history
                WHERE id = ?
                """, DETAIL_ROW_MAPPER, id);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    private static LocalDateTime toLocalDateTime(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toLocalDateTime();
    }
}
