from fastapi import APIRouter, File, HTTPException, UploadFile

from app.services.minio_client import upload_bytes

router = APIRouter(prefix="/api", tags=["upload"])


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    content = await file.read()
    filename = file.filename or "file.pdf"
    content_type = file.content_type or "application/octet-stream"

    try:
        result = upload_bytes(content, filename, content_type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return result
