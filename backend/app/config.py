from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
TEMP_DIR = BASE_DIR / "temp"
TEMP_DIR.mkdir(exist_ok=True)

MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50MB
HEADER_FOOTER_RATIO = 0.08
