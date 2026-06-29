.PHONY: build run tidy

FITZ_DIR := $(shell go list -mod=mod -m -f '{{.Dir}}' github.com/gen2brain/go-fitz)
GOOS := $(shell go env GOOS)
GOARCH := $(shell go env GOARCH)

ifeq ($(GOOS),darwin)
  ifeq ($(GOARCH),arm64)
    MUPDF_LIBS := -lmupdf_darwin_arm64 -lmupdfthird_darwin_arm64
  else
    MUPDF_LIBS := -lmupdf_darwin_amd64 -lmupdfthird_darwin_amd64
  endif
else ifeq ($(GOOS),linux)
  ifeq ($(GOARCH),arm64)
    MUPDF_LIBS := -lmupdf_linux_arm64 -lmupdfthird_linux_arm64
  else
    MUPDF_LIBS := -lmupdf_linux_amd64 -lmupdfthird_linux_amd64
  endif
else
  $(error unsupported GOOS=$(GOOS))
endif

CGO_CFLAGS := -I$(FITZ_DIR)/include
CGO_LDFLAGS := -L$(FITZ_DIR)/libs $(MUPDF_LIBS) -lm

build: tidy
	CGO_ENABLED=1 CGO_CFLAGS="$(CGO_CFLAGS)" CGO_LDFLAGS="$(CGO_LDFLAGS)" \
		go build -o server ./cmd/server

run: build
	PDF_DIFF_TEMP_DIR=../temp ./server

tidy:
	go mod download
