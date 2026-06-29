CREATE DATABASE IF NOT EXISTS mydb
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'test'@'localhost' IDENTIFIED BY 'test';
CREATE USER IF NOT EXISTS 'test'@'127.0.0.1' IDENTIFIED BY 'test';
CREATE USER IF NOT EXISTS 'test'@'%' IDENTIFIED BY 'test';

GRANT ALL PRIVILEGES ON mydb.* TO 'test'@'localhost';
GRANT ALL PRIVILEGES ON mydb.* TO 'test'@'127.0.0.1';
GRANT ALL PRIVILEGES ON mydb.* TO 'test'@'%';
FLUSH PRIVILEGES;

USE mydb;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
