"""与 frontend/src/lib/compare/types.ts 中 diffSegments 相关类型保持同步。

前端 JSON 字段为 camelCase；Python 侧使用 snake_case 属性，通过 Pydantic alias 解析。
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class CharRef(BaseModel):
    """拼接文本流中单个字符 → 原始行下标 + 行内 raw 下标 + 页码。"""

    model_config = ConfigDict(populate_by_name=True)

    line_index: int = Field(
        alias="lineIndex", description="原始行在 lines 数组中的下标"
    )
    raw_pos: int = Field(alias="rawPos", description="字符在该行 text 中的原始下标")
    page: int = Field(description="所在页码，由 lines[lineIndex].page 填充")


class SegmentDeleteRange(BaseModel):
    """分段内删除：模版侧为被删文本区间，合同侧为对应锚点位置。"""

    model_config = ConfigDict(populate_by_name=True)

    template_start: int = Field(
        alias="templateStart", description="模版侧删除起点，相对本分段 templateText"
    )
    template_end: int = Field(
        alias="templateEnd",
        description="模版侧删除终点（不含），相对本分段 templateText",
    )
    contract_start: int = Field(
        alias="contractStart", description="合同侧锚点起点，相对本分段 contractText"
    )
    contract_end: int = Field(
        alias="contractEnd",
        description="合同侧锚点终点（不含），相对本分段 contractText",
    )
    template_text: str = Field(
        alias="templateText", description="被删除的模版侧文本片段"
    )


class SegmentInsertRange(BaseModel):
    """分段内新增：合同侧为新增文本区间，模版侧为对应锚点位置。"""

    model_config = ConfigDict(populate_by_name=True)

    template_start: int = Field(
        alias="templateStart", description="模版侧锚点起点，相对本分段 templateText"
    )
    template_end: int = Field(
        alias="templateEnd",
        description="模版侧锚点终点（不含），相对本分段 templateText",
    )
    contract_start: int = Field(
        alias="contractStart", description="合同侧新增起点，相对本分段 contractText"
    )
    contract_end: int = Field(
        alias="contractEnd",
        description="合同侧新增终点（不含），相对本分段 contractText",
    )
    contract_text: str = Field(
        alias="contractText", description="新增的合同样侧文本片段"
    )


class SegmentReplaceRange(BaseModel):
    """分段内修改（替换）：两侧区间均相对各自分段文本。"""

    model_config = ConfigDict(populate_by_name=True)

    template_start: int = Field(
        alias="templateStart", description="模版侧替换起点，相对本分段 templateText"
    )
    template_end: int = Field(
        alias="templateEnd",
        description="模版侧替换终点（不含），相对本分段 templateText",
    )
    contract_start: int = Field(
        alias="contractStart", description="合同侧替换起点，相对本分段 contractText"
    )
    contract_end: int = Field(
        alias="contractEnd",
        description="合同侧替换终点（不含），相对本分段 contractText",
    )
    template_text: str = Field(alias="templateText", description="模版侧被替换文本")
    contract_text: str = Field(alias="contractText", description="合同侧替换后文本")


class DiffSegment(BaseModel):
    """锚点分段 diff 结果，供智能体接口消费。"""

    model_config = ConfigDict(populate_by_name=True)

    template_text: str = Field(
        alias="templateText", description="模版侧本分段 normalized 文本"
    )
    contract_text: str = Field(
        alias="contractText", description="合同侧本分段 normalized 文本"
    )
    template_char_map: list[CharRef] = Field(
        alias="templateCharMap",
        description="模版侧 charMap，与 templateText 逐字符对应",
    )
    contract_char_map: list[CharRef] = Field(
        alias="contractCharMap",
        description="合同侧 charMap，与 contractText 逐字符对应",
    )
    deletes: list[SegmentDeleteRange] = Field(
        description="删除区间，start/end 相对各自分段文本"
    )
    inserts: list[SegmentInsertRange] = Field(
        description="新增区间，start/end 相对各自分段文本"
    )
    replaces: list[SegmentReplaceRange] = Field(
        description="修改区间，start/end 相对各自分段文本"
    )
    template_global_start: int = Field(
        alias="templateGlobalStart",
        description="模版侧在全局拼接文本流中的起点 [start, end)",
    )
    template_global_end: int = Field(
        alias="templateGlobalEnd", description="模版侧在全局拼接文本流中的终点（不含）"
    )
    contract_global_start: int = Field(
        alias="contractGlobalStart",
        description="合同侧在全局拼接文本流中的起点 [start, end)",
    )
    contract_global_end: int = Field(
        alias="contractGlobalEnd", description="合同侧在全局拼接文本流中的终点（不含）"
    )


class DiffLineResult(BaseModel):
    """diffLines 完整输出：智能体用 diffSegments + 全局 char 渲染数据。"""

    model_config = ConfigDict(populate_by_name=True)

    diff_segments: list[DiffSegment] = Field(
        alias="diffSegments", description="锚点分段 diff 列表，供智能体逐段处理"
    )
    # raw_changes: UI 侧变更列表，智能体接口通常不需要
    # template_char_map / contract_char_map: 全局 charMap，与完整拼接文本流逐字符对应
    # template_char_bboxes / contract_char_bboxes: 全局逐字符 bbox，智能体返回后用于 PDF 渲染


DiffSegments = list[DiffSegment]
