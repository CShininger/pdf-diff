from typing import Literal

from pydantic import BaseModel


class CompareOptions(BaseModel):
    ignore_whitespace: bool = True
    ignore_header_footer: bool = True


class SideInfo(BaseModel):
    page: int
    text: str
    bboxes: list[list[float]]


class ChangeItem(BaseModel):
    id: str
    type: Literal["equal", "delete", "insert", "replace"]
    level: Literal["line"] = "line"
    template: SideInfo | None = None
    contract: SideInfo | None = None


class LineInfo(BaseModel):
    id: str
    page: int
    text: str
    bboxes: list[list[float]]


class CompareSummary(BaseModel):
    deleted_lines: int = 0
    inserted_lines: int = 0
    modified_lines: int = 0
    equal_lines: int = 0


class CompareResult(BaseModel):
    job_id: str
    status: Literal["done", "error"] = "done"
    summary: CompareSummary
    changes: list[ChangeItem]
    template_lines: list[LineInfo]
    contract_lines: list[LineInfo]


class CompareResponse(BaseModel):
    job_id: str
    status: Literal["done", "processing", "error"]
    result: CompareResult | None = None
    message: str | None = None
