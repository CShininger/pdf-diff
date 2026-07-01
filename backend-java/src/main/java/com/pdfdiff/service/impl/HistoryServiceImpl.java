package com.pdfdiff.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdfdiff.config.AppConfig;
import com.pdfdiff.entity.CompareHistory;
import com.pdfdiff.exception.ApiException;
import com.pdfdiff.mapper.CompareHistoryMapper;
import com.pdfdiff.service.HistoryService;
import com.pdfdiff.vo.CompareResult;
import com.pdfdiff.vo.CompareSummary;
import com.pdfdiff.vo.HistoryDetail;
import com.pdfdiff.vo.HistoryItem;
import com.pdfdiff.vo.HistoryListResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class HistoryServiceImpl implements HistoryService {

    private final CompareHistoryMapper compareHistoryMapper;
    private final ObjectMapper objectMapper;
    private final AppConfig appConfig;

    public HistoryServiceImpl(
            CompareHistoryMapper compareHistoryMapper,
            ObjectMapper objectMapper,
            AppConfig appConfig
    ) {
        this.compareHistoryMapper = compareHistoryMapper;
        this.objectMapper = objectMapper;
        this.appConfig = appConfig;
    }

    @Override
    public void saveHistory(
            String backend,
            String jobId,
            String templateUrl,
            String contractUrl,
            String templateName,
            String contractName,
            CompareResult result
    ) {
        try {
            CompareHistory history = new CompareHistory();
            history.setJobId(jobId);
            history.setBackend(backend);
            history.setTemplateUrl(templateUrl);
            history.setContractUrl(contractUrl);
            history.setTemplateName(templateName);
            history.setContractName(contractName);
            history.setDeletedLines(result.summary().deletedLines());
            history.setInsertedLines(result.summary().insertedLines());
            history.setModifiedLines(result.summary().modifiedLines());
            history.setEqualLines(result.summary().equalLines());
            history.setResultJson(objectMapper.writeValueAsString(result));
            compareHistoryMapper.insert(history);
        } catch (Exception ignored) {
        }
    }

    @Override
    public HistoryListResponse listHistory(int limit, int offset) {
        long current = limit > 0 ? (long) offset / limit + 1 : 1;
        Page<CompareHistory> page = compareHistoryMapper.selectPage(
                new Page<>(current, limit),
                summaryQueryWrapper()
        );
        List<HistoryItem> items = page.getRecords().stream()
                .map(this::toHistoryItem)
                .toList();
        return new HistoryListResponse(items, (int) page.getTotal());
    }

    @Override
    public HistoryDetail getHistory(long id) {
        CompareHistory history = compareHistoryMapper.selectById(id);
        if (history == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "历史记录不存在");
        }
        return toHistoryDetail(history);
    }

    @Override
    public HistoryDetail getHistoryByJobId(String jobId) {
        CompareHistory history = compareHistoryMapper.selectOne(
                new LambdaQueryWrapper<CompareHistory>()
                        .eq(CompareHistory::getJobId, jobId)
                        .orderByDesc(CompareHistory::getId)
                        .last("LIMIT 1")
        );
        if (history == null) {
            return null;
        }
        return toHistoryDetail(history);
    }

    private HistoryDetail toHistoryDetail(CompareHistory history) {
        try {
            CompareResult result = objectMapper.readValue(history.getResultJson(), CompareResult.class);
            return new HistoryDetail(
                    history.getId(),
                    history.getJobId(),
                    history.getBackend(),
                    history.getTemplateUrl(),
                    history.getContractUrl(),
                    history.getTemplateName(),
                    history.getContractName(),
                    toSummary(history),
                    formatTimestamp(history.getCreatedAt()),
                    result
            );
        } catch (Exception ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "解析历史记录失败: " + ex.getMessage());
        }
    }

    private LambdaQueryWrapper<CompareHistory> summaryQueryWrapper() {
        return new LambdaQueryWrapper<CompareHistory>()
                .select(
                        CompareHistory::getId,
                        CompareHistory::getJobId,
                        CompareHistory::getBackend,
                        CompareHistory::getTemplateUrl,
                        CompareHistory::getContractUrl,
                        CompareHistory::getTemplateName,
                        CompareHistory::getContractName,
                        CompareHistory::getDeletedLines,
                        CompareHistory::getInsertedLines,
                        CompareHistory::getModifiedLines,
                        CompareHistory::getEqualLines,
                        CompareHistory::getCreatedAt
                )
                .orderByDesc(CompareHistory::getCreatedAt, CompareHistory::getId);
    }

    private HistoryItem toHistoryItem(CompareHistory history) {
        return new HistoryItem(
                history.getId(),
                history.getJobId(),
                history.getBackend(),
                history.getTemplateUrl(),
                history.getContractUrl(),
                history.getTemplateName(),
                history.getContractName(),
                toSummary(history),
                formatTimestamp(history.getCreatedAt())
        );
    }

    private CompareSummary toSummary(CompareHistory history) {
        return new CompareSummary(
                history.getDeletedLines(),
                history.getInsertedLines(),
                history.getModifiedLines(),
                history.getEqualLines()
        );
    }

    private static String formatTimestamp(java.time.LocalDateTime timestamp) {
        if (timestamp == null) {
            return "";
        }
        return timestamp.toString().replace('T', ' ');
    }
}
