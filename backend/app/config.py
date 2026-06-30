import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
TEMP_DIR = BASE_DIR / "temp"
TEMP_DIR.mkdir(exist_ok=True)

DIFF_LOG_DIR = BASE_DIR / "diff_logs"
DIFF_LOG_DIR.mkdir(exist_ok=True)

MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50MB
HEADER_FOOTER_RATIO = 0.08

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "http://10.10.101.52:31102")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "demo-test")

MYSQL_HOST = os.getenv("MYSQL_HOST", "localhost")
MYSQL_PORT = int(os.getenv("MYSQL_PORT", "3306"))
MYSQL_USER = os.getenv("MYSQL_USER", "test")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "test")
MYSQL_DATABASE = os.getenv("MYSQL_DATABASE", "mydb")

BACKEND_NAME = os.getenv("PDF_DIFF_BACKEND", "python")
