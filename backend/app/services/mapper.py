from app.models.schemas import (
    ChangeItem,
    CompareResult,
    CompareSummary,
    LineInfo,
    SideInfo,
)
from app.services.diff_engine import RawChange
from app.services.types import LineUnit


def build_compare_result(
    job_id: str,
    template_lines: list[LineUnit],
    contract_lines: list[LineUnit],
    raw_changes: list[RawChange],
) -> CompareResult:
    changes: list[ChangeItem] = []
    summary = CompareSummary()
    change_index = 0

    for raw in raw_changes:
        if raw.type == "equal":
            summary.equal_lines += 1
            continue

        change_index += 1
        item = _to_change_item(f"c{change_index:04d}", raw)
        changes.append(item)
        _update_summary(summary, item)

    return CompareResult(
        job_id=job_id,
        summary=summary,
        changes=changes,
        template_lines=[_to_line_info(line) for line in template_lines],
        contract_lines=[_to_line_info(line) for line in contract_lines],
    )


def _to_change_item(change_id: str, raw: RawChange) -> ChangeItem:
    return ChangeItem(
        id=change_id,
        type=raw.type,  # type: ignore[arg-type]
        level="line",
        template=_side_from_lines(raw.template_lines, raw.template_bboxes),
        contract=_side_from_lines(raw.contract_lines, raw.contract_bboxes),
    )


def _side_from_lines(
    lines: list[LineUnit],
    bboxes_override: list[tuple[float, float, float, float]] | None = None,
) -> SideInfo | None:
    if not lines:
        return None

    line = lines[0]
    if bboxes_override is not None:
        bboxes = [[x0, y0, x1, y1] for x0, y0, x1, y1 in bboxes_override]
    else:
        x0, y0, x1, y1 = line.bbox
        bboxes = [[x0, y0, x1, y1]]

    return SideInfo(page=line.page, text=line.text, bboxes=bboxes)


def _to_line_info(line: LineUnit) -> LineInfo:
    x0, y0, x1, y1 = line.bbox
    return LineInfo(
        id=line.id,
        page=line.page,
        text=line.text,
        bboxes=[[x0, y0, x1, y1]],
    )


def _update_summary(summary: CompareSummary, item: ChangeItem) -> None:
    if item.type == "delete":
        summary.deleted_lines += 1
    elif item.type == "insert":
        summary.inserted_lines += 1
    elif item.type == "replace":
        summary.modified_lines += 1
