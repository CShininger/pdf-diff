//go:build !cgo

package service

import "fmt"

func pageStextJSON(pdfPath string, pageIndex int) (string, error) {
	return "", fmt.Errorf("pdf text extraction requires CGO enabled")
}

func pageCount(pdfPath string) (int, error) {
	doc, err := openFitzDoc(pdfPath)
	if err != nil {
		return 0, err
	}
	defer doc.Close()
	return doc.NumPage(), nil
}
