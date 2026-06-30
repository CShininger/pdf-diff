"""语义文本比对：段落对齐 → 行级 diff → 行内字级高亮。"""

from __future__ import annotations

import difflib
from dataclasses import dataclass, field
from pathlib import Path

from app.services.types import LineUnit


def _write_side_log(log_path: Path, side: str, lines: list[LineUnit]) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("w", encoding="utf-8") as f:
        f.write(f"diff 输入快照 - {side} (normalized)\n\n")
        f.write(f"共 {len(lines)} 行\n\n")
        for idx, line in enumerate(lines):
            f.write(f"  {idx:4d}|p{line.page + 1}|{line.normalized}\n")


def _write_diff_input_logs(
    template_log_path: Path,
    contract_log_path: Path,
    template_lines: list[LineUnit],
    contract_lines: list[LineUnit],
) -> None:
    _write_side_log(template_log_path, "模版", template_lines)
    _write_side_log(contract_log_path, "正式", contract_lines)
    print(f"[diff_engine] 模版输入已写入 {template_log_path.resolve()}")
    print(f"[diff_engine] 正式输入已写入 {contract_log_path.resolve()}")


@dataclass
class RawChange:
    type: str
    level: str
    template_lines: list[LineUnit] = field(default_factory=list)
    contract_lines: list[LineUnit] = field(default_factory=list)
    template_bboxes: list[tuple[float, float, float, float]] | None = None
    contract_bboxes: list[tuple[float, float, float, float]] | None = None


def diff_lines(
    template_lines: list[LineUnit],
    contract_lines: list[LineUnit],
    *,
    template_log_path: Path | None = None,
    contract_log_path: Path | None = None,
) -> list[RawChange]:
    if template_log_path is not None and contract_log_path is not None:
        _write_diff_input_logs(
            template_log_path, contract_log_path, template_lines, contract_lines
        )
    tpl_segments = _split_segments(template_lines)
    con_segments = _split_segments(contract_lines)
    if _segments_alignable(tpl_segments, con_segments):
        changes: list[RawChange] = []
        for (_, tpl_chunk), (_, con_chunk) in zip(
            tpl_segments, con_segments, strict=True
        ):
            if tpl_chunk and tpl_chunk[0].normalized:
                changes.extend(_diff_content_section(tpl_chunk, con_chunk))
            else:
                changes.extend(_diff_empty_run(tpl_chunk, con_chunk))
        return changes
    return _diff_line_sequence(template_lines, contract_lines)


def _segments_alignable(
    tpl_segments: list[tuple[str, list[LineUnit]]],
    con_segments: list[tuple[str, list[LineUnit]]],
) -> bool:
    if len(tpl_segments) != len(con_segments) or len(tpl_segments) <= 1:
        return False
    return all(
        (t == c for (t, _), (c, _) in zip(tpl_segments, con_segments, strict=True))
    )


def _split_segments(lines: list[LineUnit]) -> list[tuple[str, list[LineUnit]]]:
    segments: list[tuple[str, list[LineUnit]]] = []
    index = 0
    while index < len(lines):
        if not lines[index].normalized:
            start = index
            while index < len(lines) and (not lines[index].normalized):
                index += 1
            segments.append(("empty", lines[start:index]))
            continue
        start = index
        index += 1
        while index < len(lines):
            if not lines[index].normalized:
                break
            if _is_paragraph_break(lines[index - 1], lines[index]):
                break
            index += 1
        segments.append(("content", lines[start:index]))
    return segments


def _is_paragraph_break(prev: LineUnit, curr: LineUnit) -> bool:
    if prev.page != curr.page:
        return True
    prev_height = max(prev.bbox[3] - prev.bbox[1], 1.0)
    gap = curr.bbox[1] - prev.bbox[3]
    return gap > prev_height * 0.75


def _diff_content_section(tpl: list[LineUnit], con: list[LineUnit]) -> list[RawChange]:
    return _diff_line_sequence(tpl, con)


def _diff_line_sequence(tpl: list[LineUnit], con: list[LineUnit]) -> list[RawChange]:
    if not tpl and (not con):
        return []
    matcher = difflib.SequenceMatcher(
        None,
        [line.normalized for line in tpl],
        [line.normalized for line in con],
        autojunk=False,
    )
    changes: list[RawChange] = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue
        if tag == "delete":
            changes.extend(_delete_lines(tpl[i1:i2]))
        elif tag == "insert":
            changes.extend(_insert_lines(con[j1:j2]))
        elif tag == "replace":
            changes.extend(_diff_replace_block(tpl[i1:i2], con[j1:j2]))
    return changes


def _diff_replace_block(tpl: list[LineUnit], con: list[LineUnit]) -> list[RawChange]:
    if len(tpl) == len(con):
        changes: list[RawChange] = []
        for tpl_line, con_line in zip(tpl, con, strict=True):
            if tpl_line.normalized == con_line.normalized:
                continue
            pair = _diff_line_pair(tpl_line, con_line)
            if pair is not None:
                changes.append(pair)
        return changes
    if len(tpl) == 1 and len(con) == 1:
        pair = _diff_line_pair(tpl[0], con[0])
        return [pair] if pair is not None else []
    sub = difflib.SequenceMatcher(
        None,
        [line.normalized for line in tpl],
        [line.normalized for line in con],
        autojunk=False,
    )
    changes: list[RawChange] = []
    for tag, i1, i2, j1, j2 in sub.get_opcodes():
        if tag == "equal":
            continue
        if tag == "delete":
            changes.extend(_delete_lines(tpl[i1:i2]))
        elif tag == "insert":
            changes.extend(_insert_lines(con[j1:j2]))
        elif tag == "replace":
            changes.extend(_pair_replace_lines(tpl[i1:i2], con[j1:j2]))
    return changes


def _pair_replace_lines(tpl: list[LineUnit], con: list[LineUnit]) -> list[RawChange]:
    changes: list[RawChange] = []
    pair_count = min(len(tpl), len(con))
    for idx in range(pair_count):
        if tpl[idx].normalized == con[idx].normalized:
            continue
        pair = _diff_line_pair(tpl[idx], con[idx])
        if pair is not None:
            changes.append(pair)
    changes.extend(_delete_lines(tpl[pair_count:]))
    changes.extend(_insert_lines(con[pair_count:]))
    return changes


def _diff_line_pair(tpl_line: LineUnit, con_line: LineUnit) -> RawChange | None:
    if tpl_line.text == con_line.text:
        return None
    tpl_bboxes = _char_diff_bboxes(tpl_line, con_line.text)
    con_bboxes = _char_diff_bboxes(con_line, tpl_line.text)
    return RawChange(
        type="replace",
        level="line",
        template_lines=[tpl_line],
        contract_lines=[con_line],
        template_bboxes=tpl_bboxes,
        contract_bboxes=con_bboxes,
    )


def _char_diff_bboxes(
    line: LineUnit, other_text: str
) -> list[tuple[float, float, float, float]]:
    if line.text == other_text:
        return []
    matcher = difflib.SequenceMatcher(None, line.text, other_text, autojunk=False)
    ranges: list[tuple[int, int]] = []
    for tag, i1, i2, _j1, _j2 in matcher.get_opcodes():
        if tag in ("delete", "replace"):
            ranges.append((i1, i2))
    return _bboxes_for_ranges(line, ranges)


def _bboxes_for_ranges(
    line: LineUnit, ranges: list[tuple[int, int]]
) -> list[tuple[float, float, float, float]]:
    if not ranges:
        return []
    if not line.char_bboxes:
        return [line.bbox]
    bboxes: list[tuple[float, float, float, float]] = []
    for start, end in ranges:
        if start >= end:
            continue
        for char_bbox in line.char_bboxes:
            if char_bbox.end <= start or char_bbox.start >= end:
                continue
            bboxes.append(char_bbox.bbox)
    if not bboxes:
        return [line.bbox]
    return _merge_bboxes(bboxes)


def _merge_bboxes(
    bboxes: list[tuple[float, float, float, float]],
) -> list[tuple[float, float, float, float]]:
    if not bboxes:
        return []
    sorted_boxes = sorted(bboxes, key=lambda box: (box[1], box[0]))
    merged: list[tuple[float, float, float, float]] = [sorted_boxes[0]]
    for x0, y0, x1, y1 in sorted_boxes[1:]:
        last = merged[-1]
        same_row = abs(y0 - last[1]) < max(last[3] - last[1], y1 - y0, 1.0) * 0.5
        touching = x0 <= last[2] + 2
        if same_row and touching:
            merged[-1] = (last[0], min(last[1], y0), max(last[2], x1), max(last[3], y1))
        else:
            merged.append((x0, y0, x1, y1))
    return merged


def _diff_empty_run(tpl: list[LineUnit], con: list[LineUnit]) -> list[RawChange]:
    pair_count = min(len(tpl), len(con))
    changes: list[RawChange] = []
    changes.extend(_delete_lines(tpl[pair_count:]))
    changes.extend(_insert_lines(con[pair_count:]))
    return changes


def _delete_lines(lines: list[LineUnit]) -> list[RawChange]:
    return [
        RawChange(type="delete", level="line", template_lines=[line]) for line in lines
    ]


def _insert_lines(lines: list[LineUnit]) -> list[RawChange]:
    return [
        RawChange(type="insert", level="line", contract_lines=[line]) for line in lines
    ]
