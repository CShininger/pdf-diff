package service

import (
	"regexp"
	"strings"
)

var whitespaceRe = regexp.MustCompile(`\s+`)

func Normalize(text string, ignoreWhitespace bool) string {
	if text == "" {
		return ""
	}

	result := strings.TrimSpace(text)
	if ignoreWhitespace {
		result = whitespaceRe.ReplaceAllString(result, "")
	}

	result = strings.NewReplacer(
		"，", ",",
		"。", ".",
		"；", ";",
		"（", "(",
		"）", ")",
		"：", ":",
	).Replace(result)
	return result
}
