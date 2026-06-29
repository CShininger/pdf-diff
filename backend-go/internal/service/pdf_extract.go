package service

import (
	"encoding/json"
	"math"
	"strings"
	"unicode"

	"github.com/pdfdiff/backend-go/internal/domain"
)

const headerFooterRatio = 0.08

type stextPage struct {
	Blocks []stextBlock `json:"blocks"`
}

type stextRect struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	W float64 `json:"w"`
	H float64 `json:"h"`
}

type stextBlock struct {
	Type  json.RawMessage `json:"type"`
	Lines []stextLineRun  `json:"lines"`
}

type stextLineRun struct {
	Text string    `json:"text"`
	BBox stextRect `json:"bbox"`
	Font stextFont `json:"font"`
}

type stextFont struct {
	Size float64 `json:"size"`
}

func ExtractTextBlocks(pdfPath string, ignoreHeaderFooter bool) ([]domain.TextBlock, error) {
	pageTotal, err := pageCount(pdfPath)
	if err != nil {
		return nil, err
	}

	var blocks []domain.TextBlock
	for pageIndex := 0; pageIndex < pageTotal; pageIndex++ {
		jsonText, err := pageStextJSON(pdfPath, pageIndex)
		if err != nil {
			return nil, err
		}

		pageHeight := pageHeightFromBlocks(jsonText)
		headerLimit := pageHeight * headerFooterRatio
		footerLimit := pageHeight * (1 - headerFooterRatio)

		pageBlocks, err := parseStextPageJSON(jsonText, pageIndex, ignoreHeaderFooter, headerLimit, footerLimit)
		if err != nil {
			return nil, err
		}
		blocks = append(blocks, pageBlocks...)
	}

	return blocks, nil
}

func pageHeightFromBlocks(jsonText string) float64 {
	var page stextPage
	if err := json.Unmarshal([]byte(jsonText), &page); err != nil {
		return 841.9
	}

	maxY := 0.0
	for _, block := range page.Blocks {
		if !isTextBlock(block.Type) {
			continue
		}
		for _, line := range block.Lines {
			_, _, _, y1 := rectToBBox(line.BBox)
			if y1 > maxY {
				maxY = y1
			}
		}
	}
	if maxY <= 0 {
		return 841.9
	}
	return maxY + 50
}

func parseStextPageJSON(
	jsonText string,
	pageIndex int,
	ignoreHeaderFooter bool,
	headerLimit, footerLimit float64,
) ([]domain.TextBlock, error) {
	var page stextPage
	if err := json.Unmarshal([]byte(jsonText), &page); err != nil {
		return nil, err
	}

	var blocks []domain.TextBlock
	for _, block := range page.Blocks {
		if !isTextBlock(block.Type) {
			continue
		}
		for _, line := range block.Lines {
			text := line.Text
			visibleText := text
			if strings.TrimSpace(text) == "" {
				visibleText = ""
			}

			x0, y0, x1, y1 := rectToBBox(line.BBox)
			if line.BBox.W == 0 && line.BBox.H == 0 {
				continue
			}

			if visibleText != "" && ignoreHeaderFooter {
				centerY := (y0 + y1) / 2
				if (centerY < headerLimit || centerY > footerLimit) && looksLikePageNumber(strings.TrimSpace(visibleText)) {
					continue
				}
			}

			fontSize := line.Font.Size
			if fontSize <= 0 {
				fontSize = math.Max(y1-y0, 12)
			}

			charBBoxes := []domain.CharBBox{{
				Start: 0,
				End:   len(text),
				BBox:  [4]float64{x0, y0, x1, y1},
			}}

			blocks = append(blocks, domain.TextBlock{
				Page:       pageIndex,
				Text:       visibleText,
				BBox:       [4]float64{x0, y0, x1, y1},
				FontSize:   fontSize,
				CharBBoxes: charBBoxes,
			})
		}
	}

	return blocks, nil
}

func rectToBBox(r stextRect) (float64, float64, float64, float64) {
	return r.X, r.Y, r.X + r.W, r.Y + r.H
}

func isTextBlock(raw json.RawMessage) bool {
	if len(raw) == 0 {
		return false
	}
	var asString string
	if err := json.Unmarshal(raw, &asString); err == nil {
		return asString == "text"
	}
	var asNumber int
	if err := json.Unmarshal(raw, &asNumber); err == nil {
		return asNumber == 0
	}
	return false
}

func looksLikePageNumber(text string) bool {
	if text == "" {
		return false
	}
	for _, r := range text {
		if !unicode.IsDigit(r) {
			return text == "- 1 -" || text == "— 1 —"
		}
	}
	return true
}
