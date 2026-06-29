package com.pdfdiff.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdfdiff.config.AppConfig;
import com.pdfdiff.entity.CompareHistory;
import com.pdfdiff.exception.ApiException;
import com.pdfdiff.repository.CompareHistoryRepository;
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

    private final CompareHistoryRepository compareHistoryRepository;
    private final ObjectMapper objectMapper;
    private final AppConfig appConfig;

    public HistoryServiceImpl(
            CompareHistoryRepository compareHistoryRepository,
            ObjectMapper objectMapper,
            AppConfig appConfig
    ) {
        this.compareHistoryRepository = compareHistoryRepository;
        this.objectMapper = objectMapper;
        this.appConfig = appConfig;
    }

    @Override
    public void saveHistory(
            String jobId,
            String templateUrl,
            String contractUrl,
            String templateName,
            String contractName,
            CompareResult result
    ) {
        try {
            String resultJson = objectMapper.writeValueAsString(result);
            compareHistoryRepository.insert(
                    jobId,
                    appConfig.getBackendName(),
                    templateUrl,
                    contractUrl,
                    templateName,
                    contractName,
                    result.summary().deletedLines(),
                    result.summary().insertedLines(),
                    result.summary().modifiedLines(),
                    result.summary().equalLines(),
                    resultJson
            );
        } catch (Exception ignored) {
        }
    }

    @Override
    public HistoryListResponse listHistory(int limit, int offset) {
        int total = compareHistoryRepository.countAll();
        List<HistoryItem> items = compareHistoryRepository.findSummaries(limit, offset).stream()
                .map(this::toHistoryItem)
                .toList();
        return new HistoryListResponse(items, total);
    }

    @Override
    public HistoryDetail getHistory(long id) {
        CompareHistory history = compareHistoryRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "历史记录不存在"));
        try {
            CompareResult result = objectMapper.readValue(history.resultJson(), CompareResult.class);
            return new HistoryDetail(
                    history.id(),
                    history.jobId(),
                    history.backend(),
                    history.templateUrl(),
                    history.contractUrl(),
                    history.templateName(),
                    history.contractName(),
                    toSummary(history),
                    formatTimestamp(history.createdAt()),
                    result
            );
        } catch (Exception ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "解析历史记录失败: " + ex.getMessage());
        }
    }

    private HistoryItem toHistoryItem(CompareHistory history) {
        return new HistoryItem(
                history.id(),
                history.jobId(),
                history.backend(),
                history.templateUrl(),
                history.contractUrl(),
                history.templateName(),
                history.contractName(),
                toSummary(history),
                formatTimestamp(history.createdAt())
        );
    }

    private CompareSummary toSummary(CompareHistory history) {
        return new CompareSummary(
                history.deletedLines(),
                history.insertedLines(),
                history.modifiedLines(),
                history.equalLines()
        );
    }

    private static String formatTimestamp(java.time.LocalDateTime timestamp) {
        if (timestamp == null) {
            return "";
        }
        return timestamp.toString().replace('T', ' ');
    }
}
