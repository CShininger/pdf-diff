package service

import (
	"sort"
	"strconv"
	"strings"

	"github.com/pdfdiff/backend-go/internal/domain"
)

func BlocksToLines(blocks []domain.TextBlock, prefix string, ignoreWhitespace bool) []domain.LineUnit {
	if len(blocks) == 0 {
		return nil
	}

	sorted := append([]domain.TextBlock(nil), blocks...)
	sort.Slice(sorted, func(i, j int) bool {
		if sorted[i].Page != sorted[j].Page {
			return sorted[i].Page < sorted[j].Page
		}
		if sorted[i].BBox[1] != sorted[j].BBox[1] {
			return sorted[i].BBox[1] < sorted[j].BBox[1]
		}
		return sorted[i].BBox[0] < sorted[j].BBox[0]
	})

	var lines []domain.LineUnit
	currentRow := []domain.TextBlock{sorted[0]}

	for _, block := range sorted[1:] {
		prev := currentRow[len(currentRow)-1]
		if sameLine(prev, block) {
			currentRow = append(currentRow, block)
		} else {
			lines = append(lines, buildLine(currentRow, prefix, len(lines), ignoreWhitespace))
			currentRow = []domain.TextBlock{block}
		}
	}
	lines = append(lines, buildLine(currentRow, prefix, len(lines), ignoreWhitespace))
	return lines
}

func sameLine(prev, curr domain.TextBlock) bool {
	if curr.Page != prev.Page {
		return false
	}
	prevCy := (prev.BBox[1] + prev.BBox[3]) / 2
	currCy := (curr.BBox[1] + curr.BBox[3]) / 2
	lineHeight := prev.BBox[3] - prev.BBox[1]
	if lineHeight < prev.FontSize {
		lineHeight = prev.FontSize
	}
	return abs(prevCy-currCy) < lineHeight*0.5
}

func buildLine(row []domain.TextBlock, prefix string, index int, ignoreWhitespace bool) domain.LineUnit {
	var textBuilder strings.Builder
	var charBBoxes []domain.CharBBox
	offset := 0

	x0, y0 := row[0].BBox[0], row[0].BBox[1]
	x1, y1 := row[0].BBox[2], row[0].BBox[3]

	for _, block := range row {
		textBuilder.WriteString(block.Text)
		for _, cb := range block.CharBBoxes {
			charBBoxes = append(charBBoxes, domain.CharBBox{
				Start: offset + cb.Start,
				End:   offset + cb.End,
				BBox:  cb.BBox,
			})
		}
		offset += len(block.Text)
		if block.BBox[0] < x0 {
			x0 = block.BBox[0]
		}
		if block.BBox[1] < y0 {
			y0 = block.BBox[1]
		}
		if block.BBox[2] > x1 {
			x1 = block.BBox[2]
		}
		if block.BBox[3] > y1 {
			y1 = block.BBox[3]
		}
	}

	text := textBuilder.String()
	return domain.LineUnit{
		ID:         prefix + "_l" + strconv.Itoa(index),
		Page:       row[0].Page,
		Text:       text,
		Normalized: Normalize(text, ignoreWhitespace),
		BBox:       [4]float64{x0, y0, x1, y1},
		CharBBoxes: charBBoxes,
	}
}

func abs(v float64) float64 {
	if v < 0 {
		return -v
	}
	return v
}
