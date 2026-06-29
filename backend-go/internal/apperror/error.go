package apperror

import "net/http"

type APIError struct {
	Status  int
	Message string
}

func (e *APIError) Error() string {
	return e.Message
}

func BadRequest(msg string) *APIError {
	return &APIError{Status: http.StatusBadRequest, Message: msg}
}

func NotFound(msg string) *APIError {
	return &APIError{Status: http.StatusNotFound, Message: msg}
}

func Internal(msg string) *APIError {
	return &APIError{Status: http.StatusInternalServerError, Message: msg}
}
