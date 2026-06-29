package com.pdfdiff.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ChangeItem(
        String id,
        String type,
        String level,
        SideInfo template,
        SideInfo contract
) {
    public ChangeItem(String id, String type, SideInfo template, SideInfo contract) {
        this(id, type, "line", template, contract);
    }
}
