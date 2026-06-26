from dataclasses import dataclass, field

from app.services.types import LineUnit


@dataclass
class RawChange:
    type: str
    level: str
    template_lines: list[LineUnit] = field(default_factory=list)
    contract_lines: list[LineUnit] = field(default_factory=list)


def diff_lines(
    template_lines: list[LineUnit],
    contract_lines: list[LineUnit],
) -> list[RawChange]:
    tpl_segments = _split_segments(template_lines)
    con_segments = _split_segments(contract_lines)

    tpl_content = [chunk for kind, chunk in tpl_segments if kind == "content"]
    con_content = [chunk for kind, chunk in con_segments if kind == "content"]
    tpl_empty = [chunk for kind, chunk in tpl_segments if kind == "empty"]
    con_empty = [chunk for kind, chunk in con_segments if kind == "empty"]

    if len(tpl_content) == len(con_content) and len(tpl_content) >= 2:
        changes: list[RawChange] = []
        for tpl_chunk, con_chunk in zip(tpl_content, con_content):
            changes.extend(_diff_content_section(tpl_chunk, con_chunk))

        for tpl_chunk, con_chunk in zip(tpl_empty, con_empty):
            changes.extend(_diff_empty_run(tpl_chunk, con_chunk))
        changes.extend(_delete_lines(line for chunk in tpl_empty[len(con_empty) :] for line in chunk))
        changes.extend(_insert_lines(line for chunk in con_empty[len(tpl_empty) :] for line in chunk))
        return changes

    if (
        len(tpl_segments) == len(con_segments)
        and len(tpl_segments) > 1
        and all(t == c for (t, _), (c, _) in zip(tpl_segments, con_segments))
    ):
        return _diff_by_segments(tpl_segments, con_segments)

    return _diff_line_by_line(template_lines, contract_lines)


def _split_segments(lines: list[LineUnit]) -> list[tuple[str, list[LineUnit]]]:
    segments: list[tuple[str, list[LineUnit]]] = []
    index = 0

    while index < len(lines):
        if lines[index].normalized == "":
            start = index
            while index < len(lines) and lines[index].normalized == "":
                index += 1
            segments.append(("empty", lines[start:index]))
        else:
            start = index
            index += 1
            while index < len(lines):
                if lines[index].normalized == "":
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


def _diff_by_segments(
    tpl_segments: list[tuple[str, list[LineUnit]]],
    con_segments: list[tuple[str, list[LineUnit]]],
) -> list[RawChange]:
    changes: list[RawChange] = []

    for (_, tpl_chunk), (_, con_chunk) in zip(tpl_segments, con_segments):
        if tpl_chunk and tpl_chunk[0].normalized != "":
            changes.extend(_diff_content_section(tpl_chunk, con_chunk))
        else:
            changes.extend(_diff_empty_run(tpl_chunk, con_chunk))

    return changes


def _diff_content_section(
    tpl: list[LineUnit],
    con: list[LineUnit],
) -> list[RawChange]:
    changes: list[RawChange] = []
    i = j = 0

    while i < len(tpl) and j < len(con):
        if tpl[i].normalized == con[j].normalized:
            i += 1
            j += 1
            continue

        tpl_in_con = _find_line_in(tpl[i].normalized, con, j + 1, len(con))
        con_in_tpl = _find_line_in(con[j].normalized, tpl, i + 1, len(tpl))

        if tpl_in_con is not None and con_in_tpl is None:
            changes.append(
                RawChange(type="insert", level="line", contract_lines=[con[j]])
            )
            j += 1
        elif con_in_tpl is not None and tpl_in_con is None:
            changes.append(
                RawChange(type="delete", level="line", template_lines=[tpl[i]])
            )
            i += 1
        elif tpl_in_con is not None and con_in_tpl is not None:
            if tpl_in_con - j <= con_in_tpl - i:
                changes.append(
                    RawChange(type="insert", level="line", contract_lines=[con[j]])
                )
                j += 1
            else:
                changes.append(
                    RawChange(type="delete", level="line", template_lines=[tpl[i]])
                )
                i += 1
        else:
            changes.append(
                RawChange(type="delete", level="line", template_lines=[tpl[i]])
            )
            i += 1

    changes.extend(_delete_lines(tpl[i:]))
    changes.extend(_insert_lines(con[j:]))
    return changes


def _diff_empty_run(
    tpl: list[LineUnit],
    con: list[LineUnit],
) -> list[RawChange]:
    pair_count = min(len(tpl), len(con))
    changes: list[RawChange] = []
    changes.extend(_delete_lines(tpl[pair_count:]))
    changes.extend(_insert_lines(con[pair_count:]))
    return changes


def _delete_lines(lines) -> list[RawChange]:
    return [
        RawChange(type="delete", level="line", template_lines=[line])
        for line in lines
    ]


def _insert_lines(lines) -> list[RawChange]:
    return [
        RawChange(type="insert", level="line", contract_lines=[line])
        for line in lines
    ]


def _diff_line_by_line(
    tpl: list[LineUnit],
    con: list[LineUnit],
) -> list[RawChange]:
    return _diff_range(tpl, con, 0, len(tpl), 0, len(con))


def _diff_range(
    tpl: list[LineUnit],
    con: list[LineUnit],
    i: int,
    i_end: int,
    j: int,
    j_end: int,
) -> list[RawChange]:
    changes: list[RawChange] = []

    while i < i_end and j < j_end:
        tpl_line = tpl[i]
        con_line = con[j]

        if tpl_line.normalized == con_line.normalized:
            i += 1
            j += 1
            continue

        if not tpl_line.normalized and con_line.normalized:
            if i + 1 < i_end and tpl[i + 1].normalized == con_line.normalized:
                changes.append(
                    RawChange(type="delete", level="line", template_lines=[tpl_line])
                )
                i += 1
                continue
        elif tpl_line.normalized and not con_line.normalized:
            if j + 1 < j_end and con[j + 1].normalized == tpl_line.normalized:
                changes.append(
                    RawChange(type="insert", level="line", contract_lines=[con_line])
                )
                j += 1
                continue

        tpl_in_con = _find_line_in(tpl_line.normalized, con, j + 1, j_end)
        con_in_tpl = _find_line_in(con_line.normalized, tpl, i + 1, i_end)

        if tpl_in_con is not None and con_in_tpl is None:
            changes.append(
                RawChange(type="insert", level="line", contract_lines=[con_line])
            )
            j += 1
        elif con_in_tpl is not None and tpl_in_con is None:
            changes.append(
                RawChange(type="delete", level="line", template_lines=[tpl_line])
            )
            i += 1
        elif tpl_in_con is not None and con_in_tpl is not None:
            if tpl_in_con - j <= con_in_tpl - i:
                changes.append(
                    RawChange(type="insert", level="line", contract_lines=[con_line])
                )
                j += 1
            else:
                changes.append(
                    RawChange(type="delete", level="line", template_lines=[tpl_line])
                )
                i += 1
        else:
            changes.append(
                RawChange(type="delete", level="line", template_lines=[tpl_line])
            )
            i += 1

    changes.extend(_delete_lines(tpl[i:i_end]))
    changes.extend(_insert_lines(con[j:j_end]))
    return changes


def _find_line_in(text: str, lines: list[LineUnit], start: int, end: int) -> int | None:
    for idx in range(start, end):
        if lines[idx].normalized == text:
            return idx
    return None
