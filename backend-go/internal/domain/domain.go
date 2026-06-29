package domain

type CharBBox struct {
	Start int
	End   int
	BBox  [4]float64
}

type TextBlock struct {
	Page        int
	Text        string
	BBox        [4]float64
	FontSize    float64
	CharBBoxes  []CharBBox
}

type LineUnit struct {
	ID         string
	Page       int
	Text       string
	Normalized string
	BBox       [4]float64
	CharBBoxes []CharBBox
}

type RawChange struct {
	Type          string
	Level         string
	TemplateLines []LineUnit
	ContractLines []LineUnit
}

func DeleteChange(line LineUnit) RawChange {
	return RawChange{Type: "delete", Level: "line", TemplateLines: []LineUnit{line}}
}

func InsertChange(line LineUnit) RawChange {
	return RawChange{Type: "insert", Level: "line", ContractLines: []LineUnit{line}}
}

type Segment struct {
	Kind  string
	Lines []LineUnit
}
