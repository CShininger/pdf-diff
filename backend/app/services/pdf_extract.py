from pathlib import Path

import fitz

from app.services.content_filter import should_skip_block
from app.services.types import CharBBox, TextBlock


def extract_text_blocks(
    pdf_path: Path,
    *,
    ignore_header_footer: bool = True,
    header_footer_ratio: float = 0.08,
) -> list[TextBlock]:
    blocks: list[TextBlock] = []
    doc = fitz.open(pdf_path)

    try:
        for page_index, page in enumerate(doc):
            page_height = page.rect.height

            page_dict = page.get_text("dict")
            for block in page_dict.get("blocks", []):
                if block.get("type") != 0:
                    continue

                for line in block.get("lines", []):
                    text_parts: list[str] = []
                    char_bboxes: list[CharBBox] = []
                    font_sizes: list[float] = []
                    x0 = y0 = float("inf")
                    x1 = y1 = float("-inf")
                    offset = 0

                    for span in line.get("spans", []):
                        span_text = span.get("text", "")
                        if not span_text:
                            continue

                        sx0, sy0, sx1, sy1 = span["bbox"]
                        char_bboxes.extend(
                            _estimate_char_bboxes(span_text, (sx0, sy0, sx1, sy1), offset)
                        )
                        text_parts.append(span_text)
                        font_sizes.append(float(span.get("size", 12)))
                        x0 = min(x0, sx0)
                        y0 = min(y0, sy0)
                        x1 = max(x1, sx1)
                        y1 = max(y1, sy1)
                        offset += len(span_text)

                    line_bbox = line.get("bbox")
                    if line_bbox:
                        lx0, ly0, lx1, ly1 = line_bbox
                        if not text_parts:
                            x0, y0, x1, y1 = lx0, ly0, lx1, ly1
                        else:
                            x0 = min(x0, lx0)
                            y0 = min(y0, ly0)
                            x1 = max(x1, lx1)
                            y1 = max(y1, ly1)

                    if x0 == float("inf"):
                        continue

                    text = "".join(text_parts)
                    visible_text = text if text.strip() else ""

                    if visible_text and should_skip_block(
                        visible_text,
                        center_y=(y0 + y1) / 2,
                        page_height=page_height,
                        ignore_header_footer=ignore_header_footer,
                        header_footer_ratio=header_footer_ratio,
                    ):
                        continue

                    font_size = sum(font_sizes) / len(font_sizes) if font_sizes else max(y1 - y0, 12)
                    blocks.append(
                        TextBlock(
                            page=page_index,
                            text=visible_text,
                            bbox=(x0, y0, x1, y1),
                            font_size=font_size,
                            char_bboxes=char_bboxes,
                        )
                    )
    finally:
        doc.close()

    return blocks


def _estimate_char_bboxes(
    text: str,
    bbox: tuple[float, float, float, float],
    offset: int,
) -> list[CharBBox]:
    x0, y0, x1, y1 = bbox
    if not text:
        return []

    if len(text) == 1:
        return [CharBBox(start=offset, end=offset + 1, bbox=bbox)]

    char_width = (x1 - x0) / len(text)
    return [
        CharBBox(
            start=offset + index,
            end=offset + index + 1,
            bbox=(x0 + index * char_width, y0, x0 + (index + 1) * char_width, y1),
        )
        for index in range(len(text))
    ]
