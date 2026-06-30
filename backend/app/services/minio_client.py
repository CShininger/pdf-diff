import uuid
from urllib import error, request
from urllib.parse import quote

from app.config import MAX_UPLOAD_SIZE, MINIO_BUCKET, MINIO_ENDPOINT


def _public_url(object_key: str) -> str:
    base = MINIO_ENDPOINT.rstrip("/")
    encoded_key = quote(object_key, safe="")
    return f"{base}/{MINIO_BUCKET}/{encoded_key}"


def upload_bytes(
    content: bytes, filename: str, content_type: str = "application/pdf"
) -> dict[str, str]:
    if len(content) > MAX_UPLOAD_SIZE:
        raise ValueError("文件大小超过 50MB 限制")

    safe_name = filename.replace("/", "_").replace("\\", "_") or "file.pdf"
    object_key = f"{uuid.uuid4().hex}-{safe_name}"
    url = _public_url(object_key)

    req = request.Request(
        url=url,
        data=content,
        method="PUT",
        headers={"Content-Type": content_type},
    )
    try:
        with request.urlopen(req, timeout=120) as resp:
            if resp.status >= 400:
                raise ValueError(f"MinIO 上传失败: HTTP {resp.status}")
    except error.HTTPError as exc:
        raise ValueError(f"MinIO 上传失败: HTTP {exc.code}") from exc
    except error.URLError as exc:
        raise ValueError(f"无法连接 MinIO: {exc.reason}") from exc

    return {"url": url, "filename": object_key}


def download_bytes(url: str) -> tuple[bytes, str]:
    req = request.Request(url=url, method="GET")
    try:
        with request.urlopen(req, timeout=120) as resp:
            content_type = resp.headers.get("Content-Type", "application/octet-stream")
            data = resp.read(MAX_UPLOAD_SIZE + 1)
            if len(data) > MAX_UPLOAD_SIZE:
                raise ValueError("文件大小超过 50MB 限制")
            return data, content_type
    except error.HTTPError as exc:
        raise ValueError(f"下载文件失败: HTTP {exc.code}") from exc
    except error.URLError as exc:
        raise ValueError(f"无法下载文件: {exc.reason}") from exc
