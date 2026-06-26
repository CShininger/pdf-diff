import re

WHITESPACE_RE = re.compile(r"\s+")
FILL_BLANK_RE = re.compile(r"[_×X]{3,}")


def normalize(text: str, *, ignore_whitespace: bool = True) -> str:
    if not text:
        return ""

    result = text.strip()
    if ignore_whitespace:
        result = WHITESPACE_RE.sub("", result)

    result = result.replace("，", ",").replace("。", ".").replace("；", ";")
    result = result.replace("（", "(").replace("）", ")").replace("：", ":")
    return result


def is_fill_blank(text: str) -> bool:
    return bool(FILL_BLANK_RE.search(text))
