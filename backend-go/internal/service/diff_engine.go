package service

import "github.com/pdfdiff/backend-go/internal/domain"

func DiffLines(templateLines, contractLines []domain.LineUnit) []domain.RawChange {
	tplSegments := splitSegments(templateLines)
	conSegments := splitSegments(contractLines)

	tplContent := filterSegments(tplSegments, "content")
	conContent := filterSegments(conSegments, "content")
	tplEmpty := filterSegments(tplSegments, "empty")
	conEmpty := filterSegments(conSegments, "empty")

	if len(tplContent) == len(conContent) && len(tplContent) >= 2 {
		var changes []domain.RawChange
		for i := range tplContent {
			changes = append(changes, diffContentSection(tplContent[i], conContent[i])...)
		}
		emptyPairs := min(len(tplEmpty), len(conEmpty))
		for i := 0; i < emptyPairs; i++ {
			changes = append(changes, diffEmptyRun(tplEmpty[i], conEmpty[i])...)
		}
		for i := len(conEmpty); i < len(tplEmpty); i++ {
			changes = append(changes, deleteLines(tplEmpty[i])...)
		}
		for i := len(tplEmpty); i < len(conEmpty); i++ {
			changes = append(changes, insertLines(conEmpty[i])...)
		}
		return changes
	}

	if len(tplSegments) == len(conSegments) && len(tplSegments) > 1 && segmentsSameKind(tplSegments, conSegments) {
		return diffBySegments(tplSegments, conSegments)
	}

	return diffLineByLine(templateLines, contractLines)
}

type lineSlice []domain.LineUnit

func (s lineSlice) size() int { return len(s) }

func filterSegments(segments []domain.Segment, kind string) []lineSlice {
	var out []lineSlice
	for _, seg := range segments {
		if seg.Kind == kind {
			out = append(out, seg.Lines)
		}
	}
	return out
}

func segmentsSameKind(tpl, con []domain.Segment) bool {
	for i := range tpl {
		if tpl[i].Kind != con[i].Kind {
			return false
		}
	}
	return true
}

func splitSegments(lines []domain.LineUnit) []domain.Segment {
	var segments []domain.Segment
	index := 0

	for index < len(lines) {
		if lines[index].Normalized == "" {
			start := index
			for index < len(lines) && lines[index].Normalized == "" {
				index++
			}
			segments = append(segments, domain.Segment{Kind: "empty", Lines: lines[start:index]})
		} else {
			start := index
			index++
			for index < len(lines) {
				if lines[index].Normalized == "" {
					break
				}
				if isParagraphBreak(lines[index-1], lines[index]) {
					break
				}
				index++
			}
			segments = append(segments, domain.Segment{Kind: "content", Lines: lines[start:index]})
		}
	}
	return segments
}

func isParagraphBreak(prev, curr domain.LineUnit) bool {
	if prev.Page != curr.Page {
		return true
	}
	prevHeight := prev.BBox[3] - prev.BBox[1]
	if prevHeight < 1 {
		prevHeight = 1
	}
	gap := curr.BBox[1] - prev.BBox[3]
	return gap > prevHeight*0.75
}

func diffBySegments(tplSegments, conSegments []domain.Segment) []domain.RawChange {
	var changes []domain.RawChange
	for i := range tplSegments {
		tplChunk := tplSegments[i].Lines
		conChunk := conSegments[i].Lines
		if len(tplChunk) > 0 && tplChunk[0].Normalized != "" {
			changes = append(changes, diffContentSection(tplChunk, conChunk)...)
		} else {
			changes = append(changes, diffEmptyRun(tplChunk, conChunk)...)
		}
	}
	return changes
}

func diffContentSection(tpl, con []domain.LineUnit) []domain.RawChange {
	var changes []domain.RawChange
	i, j := 0, 0

	for i < len(tpl) && j < len(con) {
		if tpl[i].Normalized == con[j].Normalized {
			i++
			j++
			continue
		}

		tplInCon := findLineIn(tpl[i].Normalized, con, j+1, len(con))
		conInTpl := findLineIn(con[j].Normalized, tpl, i+1, len(tpl))

		switch {
		case tplInCon >= 0 && conInTpl < 0:
			changes = append(changes, domain.InsertChange(con[j]))
			j++
		case conInTpl >= 0 && tplInCon < 0:
			changes = append(changes, domain.DeleteChange(tpl[i]))
			i++
		case tplInCon >= 0 && conInTpl >= 0:
			if tplInCon-j <= conInTpl-i {
				changes = append(changes, domain.InsertChange(con[j]))
				j++
			} else {
				changes = append(changes, domain.DeleteChange(tpl[i]))
				i++
			}
		default:
			changes = append(changes, domain.DeleteChange(tpl[i]))
			i++
		}
	}

	changes = append(changes, deleteLines(tpl[i:])...)
	changes = append(changes, insertLines(con[j:])...)
	return changes
}

func diffEmptyRun(tpl, con []domain.LineUnit) []domain.RawChange {
	pairCount := min(len(tpl), len(con))
	var changes []domain.RawChange
	if pairCount < len(tpl) {
		changes = append(changes, deleteLines(tpl[pairCount:])...)
	}
	if pairCount < len(con) {
		changes = append(changes, insertLines(con[pairCount:])...)
	}
	return changes
}

func deleteLines(lines []domain.LineUnit) []domain.RawChange {
	changes := make([]domain.RawChange, 0, len(lines))
	for _, line := range lines {
		changes = append(changes, domain.DeleteChange(line))
	}
	return changes
}

func insertLines(lines []domain.LineUnit) []domain.RawChange {
	changes := make([]domain.RawChange, 0, len(lines))
	for _, line := range lines {
		changes = append(changes, domain.InsertChange(line))
	}
	return changes
}

func diffLineByLine(tpl, con []domain.LineUnit) []domain.RawChange {
	return diffRange(tpl, con, 0, len(tpl), 0, len(con))
}

func diffRange(tpl, con []domain.LineUnit, i, iEnd, j, jEnd int) []domain.RawChange {
	var changes []domain.RawChange

	for i < iEnd && j < jEnd {
		tplLine := tpl[i]
		conLine := con[j]

		if tplLine.Normalized == conLine.Normalized {
			i++
			j++
			continue
		}

		if tplLine.Normalized == "" && conLine.Normalized != "" {
			if i+1 < iEnd && tpl[i+1].Normalized == conLine.Normalized {
				changes = append(changes, domain.DeleteChange(tplLine))
				i++
				continue
			}
		} else if tplLine.Normalized != "" && conLine.Normalized == "" {
			if j+1 < jEnd && con[j+1].Normalized == tplLine.Normalized {
				changes = append(changes, domain.InsertChange(conLine))
				j++
				continue
			}
		}

		tplInCon := findLineIn(tplLine.Normalized, con, j+1, jEnd)
		conInTpl := findLineIn(conLine.Normalized, tpl, i+1, iEnd)

		switch {
		case tplInCon >= 0 && conInTpl < 0:
			changes = append(changes, domain.InsertChange(conLine))
			j++
		case conInTpl >= 0 && tplInCon < 0:
			changes = append(changes, domain.DeleteChange(tplLine))
			i++
		case tplInCon >= 0 && conInTpl >= 0:
			if tplInCon-j <= conInTpl-i {
				changes = append(changes, domain.InsertChange(conLine))
				j++
			} else {
				changes = append(changes, domain.DeleteChange(tplLine))
				i++
			}
		default:
			changes = append(changes, domain.DeleteChange(tplLine))
			i++
		}
	}

	changes = append(changes, deleteLines(tpl[i:iEnd])...)
	changes = append(changes, insertLines(con[j:jEnd])...)
	return changes
}

func findLineIn(text string, lines []domain.LineUnit, start, end int) int {
	for idx := start; idx < end; idx++ {
		if lines[idx].Normalized == text {
			return idx
		}
	}
	return -1
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
