from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import HistoryDetail
from app.services import history_db

router = APIRouter(prefix="/api", tags=["history"])


@router.get("/history")
async def list_history(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    try:
        return history_db.list_history(limit=limit, offset=offset)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"读取历史记录失败: {exc}") from exc


@router.get("/history/{history_id}", response_model=HistoryDetail)
async def get_history(history_id: int):
    try:
        detail = history_db.get_history(history_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"读取历史记录失败: {exc}") from exc

    if detail is None:
        raise HTTPException(status_code=404, detail="历史记录不存在")
    return detail
