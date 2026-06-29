package service

import (
	"fmt"

	"github.com/pdfdiff/backend-go/internal/domain"
	"github.com/pdfdiff/backend-go/internal/dto"
)

func BuildCompareResult(
	jobID string,
	templateLines, contractLines []domain.LineUnit,
	rawChanges []domain.RawChange,
) dto.CompareResult {
	var changes []dto.ChangeItem
	summary := dto.CompareSummary{}
	changeIndex := 0

	for _, raw := range rawChanges {
		if raw.Type == "equal" {
			summary.EqualLines++
			continue
		}

		changeIndex++
		item := toChangeItem(fmt.Sprintf("c%04d", changeIndex), raw)
		changes = append(changes, item)
		summary = updateSummary(summary, item)
	}

	templateInfo := make([]dto.LineInfo, len(templateLines))
	for i, line := range templateLines {
		templateInfo[i] = toLineInfo(line)
	}
	contractInfo := make([]dto.LineInfo, len(contractLines))
	for i, line := range contractLines {
		contractInfo[i] = toLineInfo(line)
	}

	return dto.CompareResult{
		JobID:         jobID,
		Status:        "done",
		Summary:       summary,
		Changes:       changes,
		TemplateLines: templateInfo,
		ContractLines: contractInfo,
	}
}

func toChangeItem(changeID string, raw domain.RawChange) dto.ChangeItem {
	return dto.ChangeItem{
		ID:       changeID,
		Type:     raw.Type,
		Level:    "line",
		Template: sideFromLines(raw.TemplateLines),
		Contract: sideFromLines(raw.ContractLines),
	}
}

func sideFromLines(lines []domain.LineUnit) *dto.SideInfo {
	if len(lines) == 0 {
		return nil
	}
	line := lines[0]
	bbox := line.BBox
	return &dto.SideInfo{
		Page:   line.Page,
		Text:   line.Text,
		BBoxes: [][]float64{{bbox[0], bbox[1], bbox[2], bbox[3]}},
	}
}

func toLineInfo(line domain.LineUnit) dto.LineInfo {
	bbox := line.BBox
	return dto.LineInfo{
		ID:     line.ID,
		Page:   line.Page,
		Text:   line.Text,
		BBoxes: [][]float64{{bbox[0], bbox[1], bbox[2], bbox[3]}},
	}
}

func updateSummary(summary dto.CompareSummary, item dto.ChangeItem) dto.CompareSummary {
	switch item.Type {
	case "delete":
		summary.DeletedLines++
	case "insert":
		summary.InsertedLines++
	case "replace":
		summary.ModifiedLines++
	}
	return summary
}
