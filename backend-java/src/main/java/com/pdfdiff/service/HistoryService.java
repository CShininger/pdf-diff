package com.pdfdiff.service;

import com.pdfdiff.vo.CompareResult;
import com.pdfdiff.vo.HistoryDetail;
import com.pdfdiff.vo.HistoryListResponse;

public interface HistoryService {

    void saveHistory(
            String jobId,
            String templateUrl,
            String contractUrl,
            String templateName,
            String contractName,
            CompareResult result
    );

    HistoryListResponse listHistory(int limit, int offset);

    HistoryDetail getHistory(long id);

    HistoryDetail getHistoryByJobId(String jobId);
}
