package com.pdfdiff.config;

import jakarta.annotation.PostConstruct;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class DatabaseInitializer {

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

    public DatabaseInitializer(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostConstruct
    public void init() {
        jdbcTemplate.execute(CREATE_TABLE_SQL);
    }
}
