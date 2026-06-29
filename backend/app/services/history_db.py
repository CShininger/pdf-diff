import json
from contextlib import contextmanager
from datetime import datetime
from typing import Any

import pymysql
from pymysql.cursors import DictCursor

from app.config import (
    BACKEND_NAME,
    MYSQL_DATABASE,
    MYSQL_HOST,
    MYSQL_PASSWORD,
    MYSQL_PORT,
    MYSQL_USER,
)
from app.models.schemas import CompareResult, HistoryDetail, HistoryItem, HistoryListResponse

_CREATE_TABLE_SQL = """
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
"""


def init_db() -> None:
    conn = pymysql.connect(
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD,
        charset="utf8mb4",
        autocommit=True,
    )
    try:
        with conn.cursor() as cur:
            cur.execute(f"CREATE DATABASE IF NOT EXISTS `{MYSQL_DATABASE}`")
            cur.execute(f"USE `{MYSQL_DATABASE}`")
            cur.execute(_CREATE_TABLE_SQL)
    finally:
        conn.close()


@contextmanager
def _connection():
    conn = pymysql.connect(
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD,
        database=MYSQL_DATABASE,
        charset="utf8mb4",
        cursorclass=DictCursor,
        autocommit=True,
    )
    try:
        yield conn
    finally:
        conn.close()


def save_history(
    job_id: str,
    template_url: str,
    contract_url: str,
    template_name: str,
    contract_name: str,
    result: CompareResult,
) -> int:
    summary = result.summary
    result_json = result.model_dump_json()
    with _connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO compare_history (
                    job_id, backend, template_url, contract_url,
                    template_name, contract_name,
                    deleted_lines, inserted_lines, modified_lines, equal_lines,
                    result_json
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    job_id,
                    BACKEND_NAME,
                    template_url,
                    contract_url,
                    template_name,
                    contract_name,
                    summary.deleted_lines,
                    summary.inserted_lines,
                    summary.modified_lines,
                    summary.equal_lines,
                    result_json,
                ),
            )
            return int(cur.lastrowid)


def list_history(limit: int = 50, offset: int = 0) -> HistoryListResponse:
    with _connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS total FROM compare_history")
            total_row = cur.fetchone() or {"total": 0}
            total = int(total_row["total"])

            cur.execute(
                """
                SELECT id, job_id, backend, template_url, contract_url,
                       template_name, contract_name,
                       deleted_lines, inserted_lines, modified_lines, equal_lines,
                       created_at
                FROM compare_history
                ORDER BY created_at DESC, id DESC
                LIMIT %s OFFSET %s
                """,
                (limit, offset),
            )
            rows = cur.fetchall() or []

    items = [_row_to_item(row) for row in rows]
    return HistoryListResponse(items=items, total=total)


def get_history(history_id: int) -> HistoryDetail | None:
    with _connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, job_id, backend, template_url, contract_url,
                       template_name, contract_name,
                       deleted_lines, inserted_lines, modified_lines, equal_lines,
                       result_json, created_at
                FROM compare_history
                WHERE id = %s
                """,
                (history_id,),
            )
            row = cur.fetchone()
    if not row:
        return None

    item = _row_to_item(row)
    result = CompareResult.model_validate_json(row["result_json"])
    return HistoryDetail(**item.model_dump(), result=result)


def _row_to_item(row: dict[str, Any]) -> HistoryItem:
    created_at = row["created_at"]
    if isinstance(created_at, datetime):
        created_at_str = created_at.isoformat(sep=" ", timespec="seconds")
    else:
        created_at_str = str(created_at)

    return HistoryItem(
        id=int(row["id"]),
        job_id=row["job_id"],
        backend=row["backend"],
        template_url=row["template_url"],
        contract_url=row["contract_url"],
        template_name=row["template_name"],
        contract_name=row["contract_name"],
        summary={
            "deleted_lines": int(row["deleted_lines"]),
            "inserted_lines": int(row["inserted_lines"]),
            "modified_lines": int(row["modified_lines"]),
            "equal_lines": int(row["equal_lines"]),
        },
        created_at=created_at_str,
    )
