//go:build !cgo || !mupdf

package service

import "fmt"

func pageStextJSON(pdfPath string, pageIndex int) (string, error) {
	return "", fmt.Errorf("pdf text extraction requires CGO and -tags mupdf (use make build)")
}

func pageCount(pdfPath string) (int, error) {
	doc, err := openFitzDoc(pdfPath)
	if err != nil {
		return 0, err
	}
	defer doc.Close()
	return doc.NumPage(), nil
}
