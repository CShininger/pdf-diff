import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse

from app.config import TEMP_DIR
from app.models.schemas import CompareResponse, CompareURLRequest
from app.services import history_db
from app.services.diff_engine import diff_lines
from app.services.line import blocks_to_lines
from app.services.mapper import build_compare_result
from app.services.minio_client import download_bytes
from app.services.pdf_extract import extract_text_blocks

router = APIRouter(prefix="/api", tags=["compare"])


@router.post("/compare", response_model=CompareResponse)
async def compare_pdfs(body: CompareURLRequest):
    try:
        template_content, template_type = download_bytes(body.template_url)
        contract_content, contract_type = download_bytes(body.contract_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if template_type not in {"application/pdf", "application/octet-stream"}:
        raise HTTPException(status_code=400, detail="模版文件必须是 PDF")
    if contract_type not in {"application/pdf", "application/octet-stream"}:
        raise HTTPException(status_code=400, detail="正式文件必须是 PDF")

    compare_options = body.options
    job_id = str(uuid.uuid4())
    job_dir = TEMP_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    template_path = job_dir / "template.pdf"
    contract_path = job_dir / "contract.pdf"

    try:
        template_path.write_bytes(template_content)
        contract_path.write_bytes(contract_content)

        template_blocks = extract_text_blocks(
            template_path,
            ignore_header_footer=compare_options.ignore_header_footer,
        )
        contract_blocks = extract_text_blocks(
            contract_path,
            ignore_header_footer=compare_options.ignore_header_footer,
        )

        template_lines = blocks_to_lines(
            template_blocks,
            prefix="tpl",
            ignore_whitespace=compare_options.ignore_whitespace,
            filter_irrelevant=compare_options.ignore_header_footer,
        )
        contract_lines = blocks_to_lines(
            contract_blocks,
            prefix="con",
            ignore_whitespace=compare_options.ignore_whitespace,
            filter_irrelevant=compare_options.ignore_header_footer,
        )

        raw_changes = diff_lines(template_lines, contract_lines)

        result = build_compare_result(
            job_id,
            template_lines,
            contract_lines,
            raw_changes,
        )

        try:
            history_db.save_history(
                job_id=job_id,
                template_url=body.template_url,
                contract_url=body.contract_url,
                template_name=body.template_name,
                contract_name=body.contract_name,
                result=result,
            )
        except Exception:
            pass

        return CompareResponse(job_id=job_id, status="done", result=result)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"比对失败: {exc}") from exc
    finally:
        shutil.rmtree(job_dir, ignore_errors=True)


@router.get("/compare/{job_id}", response_model=CompareResponse)
async def get_compare_result(job_id: str):
    try:
        detail = history_db.get_history_by_job_id(job_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"读取比对结果失败: {exc}") from exc

    if detail is None or detail.result is None:
        raise HTTPException(status_code=404, detail="任务不存在或已过期")

    return CompareResponse(job_id=job_id, status="done", result=detail.result)


@router.get("/files/{job_id}/{which}")
async def get_pdf_file(job_id: str, which: str):
    if which not in {"template", "contract"}:
        raise HTTPException(status_code=400, detail="which 只能是 template 或 contract")

    try:
        detail = history_db.get_history_by_job_id(job_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"读取文件信息失败: {exc}") from exc

    if detail is None:
        raise HTTPException(status_code=404, detail="文件不存在")

    pdf_url = detail.template_url if which == "template" else detail.contract_url
    return RedirectResponse(url=pdf_url, status_code=307)
