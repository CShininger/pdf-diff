import re

# 页码：纯数字、第X页、Page N、N/M、- N - 等
_PAGE_NUMBER_RE = re.compile(
    r"^("
    r"\d{1,4}"
    r"|\d{1,4}\s*/\s*\d{1,4}"
    r"|第\s*[\d一二三四五六七八九十百千万]+\s*页"
    r"|[Pp]age\s*\d+"
    r"|[Pp]\.\s*\d+"
    r"|-\s*\d+\s*-"
    r"|—\s*\d+\s*—"
    r"|·\s*\d+\s*·"
    r"|\[\s*\d+\s*\]"
    r"|\(\s*\d+\s*\)"
    r"|[ivxlcdmIVXLCDM]{1,6}"
    r"|共\s*\d+\s*页"
    r")$"
)

# 页眉页脚常见重复信息（短文本）
_BOILERPLATE_RE = re.compile(
    r"^("
    r"机密|秘密|内部资料|仅供参考|草稿|DRAFT|CONFIDENTIAL|INTERNAL"
    r"|版权所有|©|Copyright\s+\d{4}"
    r")$",
    re.IGNORECASE,
)


def is_page_number(text: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return False
    if _PAGE_NUMBER_RE.match(stripped):
        return True
    # 去除空白后再匹配一次（如 "1 "、" 2"）
    compact = re.sub(r"\s+", "", stripped)
    return bool(_PAGE_NUMBER_RE.match(compact))


def is_boilerplate(text: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return False
    if _BOILERPLATE_RE.match(stripped):
        return True
    if len(stripped) <= 2 and not re.search(r"[\u4e00-\u9fff]", stripped):
        return True
    return False


def is_irrelevant_content(text: str) -> bool:
    return is_page_number(text) or is_boilerplate(text)


def should_skip_block(
    text: str,
    *,
    center_y: float,
    page_height: float,
    ignore_header_footer: bool,
    header_footer_ratio: float = 0.08,
) -> bool:
    stripped = text.strip()
    if not stripped:
        return True

    if is_page_number(stripped):
        return True

    if not ignore_header_footer:
        return is_boilerplate(stripped)

    header_limit = page_height * header_footer_ratio
    footer_limit = page_height * (1 - header_footer_ratio)
    in_margin = center_y < header_limit or center_y > footer_limit

    if in_margin:
        return True

    # 页脚居中页码：底部 12% 且文本较短
    bottom_zone = page_height * 0.88
    if center_y > bottom_zone and len(stripped) <= 20 and is_page_number(stripped):
        return True

    return is_boilerplate(stripped)
