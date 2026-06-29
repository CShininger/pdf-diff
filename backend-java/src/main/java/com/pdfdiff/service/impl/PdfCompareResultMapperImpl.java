package com.pdfdiff.service.impl;

import com.pdfdiff.model.LineUnit;
import com.pdfdiff.service.PdfCompareResultMapper;
import com.pdfdiff.vo.ChangeItem;
import com.pdfdiff.vo.CompareResult;
import com.pdfdiff.vo.CompareSummary;
import com.pdfdiff.vo.LineInfo;
import com.pdfdiff.vo.SideInfo;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

@Service
public class PdfCompareResultMapperImpl implements PdfCompareResultMapper {

    /**
     * PdfCompare 只能给出整页级差异区域，不适合作为 PDF 高亮 bbox。
     * 仅在文本 diff 无结果、但像素比对发现差异时使用，且不返回 bbox，避免整页被覆盖。
     */
    @Override
    public CompareResult buildVisualPageChanges(
            String jobId,
            de.redsix.pdfcompare.CompareResult pdfCompareResult,
            List<LineUnit> templateLines,
            List<LineUnit> contractLines
    ) {
        List<ChangeItem> changes = new ArrayList<>();
        Collection<Integer> diffPages = pdfCompareResult.getPagesWithDifferences();
        int changeIndex = 0;

        for (int pageNumber : diffPages) {
            changeIndex++;
            int page = pageNumber - 1;
            String label = "第 " + pageNumber + " 页存在视觉差异";
            changes.add(new ChangeItem(
                    String.format("c%04d", changeIndex),
                    "replace",
                    new SideInfo(page, label, List.of()),
                    new SideInfo(page, label, List.of())
            ));
        }

        CompareSummary summary = new CompareSummary(0, 0, changes.size(), 0);
        return new CompareResult(
                jobId,
                summary,
                changes,
                templateLines.stream().map(this::toLineInfo).toList(),
                contractLines.stream().map(this::toLineInfo).toList()
        );
    }

    private LineInfo toLineInfo(LineUnit line) {
        double[] bbox = line.bbox();
        return new LineInfo(
                line.id(),
                line.page(),
                line.text(),
                List.of(List.of(bbox[0], bbox[1], bbox[2], bbox[3]))
        );
    }
}
