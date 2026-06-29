import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.config import TEMP_DIR
from app.models.schemas import CompareOptions, CompareResponse, CompareResult, CompareURLRequest
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
    result_path = job_dir / "result.json"

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
        )
        contract_lines = blocks_to_lines(
            contract_blocks,
            prefix="con",
            ignore_whitespace=compare_options.ignore_whitespace,
        )

        raw_changes = diff_lines(template_lines, contract_lines)

        result = build_compare_result(
            job_id,
            template_lines,
            contract_lines,
            raw_changes,
        )
        result_path.write_text(result.model_dump_json(indent=2), encoding="utf-8")

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
        shutil.rmtree(job_dir, ignore_errors=True)
        raise
    except Exception as exc:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"比对失败: {exc}") from exc


@router.get("/compare/{job_id}", response_model=CompareResponse)
async def get_compare_result(job_id: str):
    result_path = TEMP_DIR / job_id / "result.json"
    if not result_path.exists():
        raise HTTPException(status_code=404, detail="任务不存在或已过期")

    result = CompareResult.model_validate_json(result_path.read_text(encoding="utf-8"))
    return CompareResponse(job_id=job_id, status="done", result=result)


@router.get("/files/{job_id}/{which}")
async def get_pdf_file(job_id: str, which: str):
    if which not in {"template", "contract"}:
        raise HTTPException(status_code=400, detail="which 只能是 template 或 contract")

    pdf_path = TEMP_DIR / job_id / f"{which}.pdf"
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")

    return FileResponse(pdf_path, media_type="application/pdf", filename=f"{which}.pdf")
