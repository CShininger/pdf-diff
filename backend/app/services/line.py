from app.services.content_filter import is_irrelevant_content
from app.services.normalize import normalize
from app.services.types import CharBBox, LineUnit, TextBlock


def blocks_to_lines(
    blocks: list[TextBlock],
    *,
    prefix: str,
    ignore_whitespace: bool = True,
    filter_irrelevant: bool = True,
) -> list[LineUnit]:
    if not blocks:
        return []

    sorted_blocks = sorted(blocks, key=lambda b: (b.page, b.bbox[1], b.bbox[0]))
    lines: list[LineUnit] = []
    current_row: list[TextBlock] = [sorted_blocks[0]]

    for block in sorted_blocks[1:]:
        prev = current_row[-1]
        if _same_line(prev, block):
            current_row.append(block)
        else:
            lines.append(_build_line(current_row, prefix, len(lines), ignore_whitespace))
            current_row = [block]

    lines.append(_build_line(current_row, prefix, len(lines), ignore_whitespace))

    if filter_irrelevant:
        lines = [line for line in lines if not is_irrelevant_content(line.text)]

    return lines


def _same_line(prev: TextBlock, curr: TextBlock) -> bool:
    if curr.page != prev.page:
        return False

    prev_cy = (prev.bbox[1] + prev.bbox[3]) / 2
    curr_cy = (curr.bbox[1] + curr.bbox[3]) / 2
    line_height = max(prev.bbox[3] - prev.bbox[1], prev.font_size)
    return abs(prev_cy - curr_cy) < line_height * 0.5


def _build_line(
    row: list[TextBlock],
    prefix: str,
    index: int,
    ignore_whitespace: bool,
) -> LineUnit:
    text_parts: list[str] = []
    char_bboxes: list[CharBBox] = []
    offset = 0

    for block in row:
        text_parts.append(block.text)
        for cb in block.char_bboxes:
            char_bboxes.append(
                CharBBox(start=offset + cb.start, end=offset + cb.end, bbox=cb.bbox)
            )
        offset += len(block.text)

    text = "".join(text_parts)
    x0 = min(block.bbox[0] for block in row)
    y0 = min(block.bbox[1] for block in row)
    x1 = max(block.bbox[2] for block in row)
    y1 = max(block.bbox[3] for block in row)

    return LineUnit(
        id=f"{prefix}_l{index}",
        page=row[0].page,
        text=text,
        normalized=normalize(text, ignore_whitespace=ignore_whitespace),
        bbox=(x0, y0, x1, y1),
        char_bboxes=char_bboxes,
    )
