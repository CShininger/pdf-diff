package com.pdfdiff.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("compare_history")
public class CompareHistory {

    @TableId(type = IdType.AUTO)
    private Long id;
    private String jobId;
    private String backend;
    private String templateUrl;
    private String contractUrl;
    private String templateName;
    private String contractName;
    private Integer deletedLines;
    private Integer insertedLines;
    private Integer modifiedLines;
    private Integer equalLines;
    private String resultJson;
    private LocalDateTime createdAt;
}
