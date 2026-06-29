package service

import "github.com/gen2brain/go-fitz"

func openFitzDoc(pdfPath string) (*fitz.Document, error) {
	return fitz.New(pdfPath)
}
