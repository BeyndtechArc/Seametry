package gateway

import (
	"encoding/json"
	"net/http"

	"github.com/BeyndtechArc/Seametry/server/internal/gateway/api"
)

// NewHandler wires the strict server interface, RFC 9457 error responses for
// binding and encoding failures (docs/prd/API.md section 4.4; the generated
// default writes plain text, which this replaces), and CORS, into the one
// handler server/cmd/seametry serves at /v1.
func NewHandler(si api.StrictServerInterface, middleware ...func(http.Handler) http.Handler) http.Handler {
	strict := api.NewStrictHandlerWithOptions(si, nil, api.StrictHTTPServerOptions{
		RequestErrorHandlerFunc:  writeProblem(http.StatusBadRequest, "The request"),
		ResponseErrorHandlerFunc: writeProblem(http.StatusInternalServerError, "The server"),
	})
	// ErrorHandlerFunc here is a second, separate hook from the strict
	// handler's above: it catches a parameter that fails to bind (a bad
	// as_of, a missing required query param) before the request ever
	// reaches the strict layer. Both need the same RFC 9457 treatment, or
	// only some errors come back as problem+json.
	mux := api.HandlerWithOptions(strict, api.StdHTTPServerOptions{
		BaseURL:          "/v1",
		ErrorHandlerFunc: writeProblem(http.StatusBadRequest, "The request"),
	})
	var handler http.Handler = mux
	for index := len(middleware) - 1; index >= 0; index-- {
		handler = middleware[index](handler)
	}
	return CORS(handler)
}

// writeProblem returns a handler-error function that writes err.Error() into
// an RFC 9457 body naming what went wrong, rather than the generated
// default's plain text (docs/prd/API.md section 4.4: "every detail names the
// value, what was expected, and where it came from"). subject prefixes the
// message so a request-binding failure and a response-encoding failure read
// differently.
func writeProblem(status int, subject string) func(w http.ResponseWriter, r *http.Request, err error) {
	return func(w http.ResponseWriter, r *http.Request, err error) {
		w.Header().Set("Content-Type", "application/problem+json")
		w.WriteHeader(status)
		json.NewEncoder(w).Encode(api.Problem{
			Type:   problemTypeUnspecified,
			Title:  http.StatusText(status),
			Status: status,
			Detail: subject + " for " + r.URL.Path + ": " + err.Error(),
		})
	}
}
