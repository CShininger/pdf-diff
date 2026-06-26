from dataclasses import dataclass, field


@dataclass
class CharBBox:
    start: int
    end: int
    bbox: tuple[float, float, float, float]


@dataclass
class TextBlock:
    page: int
    text: str
    bbox: tuple[float, float, float, float]
    font_size: float
    char_bboxes: list[CharBBox] = field(default_factory=list)


@dataclass
class LineUnit:
    id: str
    page: int
    text: str
    normalized: str
    bbox: tuple[float, float, float, float]
    char_bboxes: list[CharBBox] = field(default_factory=list)
