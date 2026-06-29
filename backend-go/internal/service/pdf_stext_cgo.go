//go:build cgo

package service

// MuPDF headers/libs: CGO_CFLAGS / CGO_LDFLAGS from Makefile (go mod cache).

/*
#include <mupdf/fitz.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
	char *json;
	char *error;
} page_json_result;

static page_json_result page_stext_json(const char *filename, int page_num) {
	page_json_result result = {NULL, NULL};
	fz_context *ctx = fz_new_context(NULL, NULL, FZ_STORE_DEFAULT);
	if (!ctx) {
		result.error = strdup("cannot create mupdf context");
		return result;
	}

	fz_var(result);

	fz_try(ctx) {
		fz_register_document_handlers(ctx);
		fz_document *doc = fz_open_document(ctx, filename);
		fz_page *page = fz_load_page(ctx, doc, page_num);
		fz_rect bounds = fz_bound_page(ctx, page);

		fz_stext_options opts = {0};
		fz_stext_page *stext = fz_new_stext_page(ctx, bounds);
		fz_device *dev = fz_new_stext_device(ctx, stext, &opts);
		fz_run_page_contents(ctx, page, dev, fz_identity, NULL);
		fz_close_device(ctx, dev);
		fz_drop_device(ctx, dev);

		fz_buffer *buf = fz_new_buffer(ctx, 4096);
		fz_output *out = fz_new_output_with_buffer(ctx, buf);
		fz_print_stext_page_as_json(ctx, out, stext, 1.0f);
		fz_close_output(ctx, out);
		fz_drop_output(ctx, out);

		const char *raw = fz_string_from_buffer(ctx, buf);
		if (raw) {
			result.json = strdup(raw);
		}
		fz_drop_buffer(ctx, buf);
		fz_drop_stext_page(ctx, stext);
		fz_drop_page(ctx, page);
		fz_drop_document(ctx, doc);
	}
	fz_catch(ctx) {
		result.error = strdup("cannot extract page text");
	}

	fz_drop_context(ctx);
	return result;
}

static void free_page_json_result(page_json_result result) {
	free(result.json);
	free(result.error);
}
*/
import "C"

import (
	"fmt"
	"unsafe"
)

func pageStextJSON(pdfPath string, pageIndex int) (string, error) {
	cPath := C.CString(pdfPath)
	defer C.free(unsafe.Pointer(cPath))

	result := C.page_stext_json(cPath, C.int(pageIndex))
	defer C.free_page_json_result(result)

	if result.error != nil {
		return "", fmt.Errorf("%s", C.GoString(result.error))
	}
	if result.json == nil {
		return "", fmt.Errorf("empty stext json")
	}
	return C.GoString(result.json), nil
}

func pageCount(pdfPath string) (int, error) {
	doc, err := openFitzDoc(pdfPath)
	if err != nil {
		return 0, err
	}
	defer doc.Close()
	return doc.NumPage(), nil
}
