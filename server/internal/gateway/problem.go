// Package gateway is the Gateway service (docs/SERVICE_CATALOG.md section
// 3.10): the envelope every response carries, RFC 9457 problem details, CORS,
// and the strict server interface generated from contracts/openapi/
// openapi.yaml. It owns no schema of its own (docs/prd/API.md section 5:
// "the gateway owns none of this data").
package gateway

import "github.com/BeyndtechArc/Seametry/server/internal/gateway/api"

// problemTypeUnspecified stands in for every problem type below: none has a
// dereferenceable page yet, since no domain is settled for one
// (docs/prd/API.md section 14 lists the API's own domain as open).
// "about:blank" is RFC 9457's own stated default for exactly this case, and
// is preferred here over guessing a URL.
const problemTypeUnspecified = "about:blank"

// notBuilt is the Problem body for an operation contracts/openapi/
// openapi.yaml specifies but no handler answers yet. It is never an empty
// 200 (docs/prd/API.md section 13): a client asking for something this
// server cannot yet answer gets a typed, honest 501 naming the build step
// that closes the gap.
func notBuilt(operation, step string) api.Problem {
	return api.Problem{
		Type:   problemTypeUnspecified,
		Title:  "Not built yet",
		Status: 501,
		Detail: operation + " is specified in contracts/openapi/openapi.yaml but has no handler yet. It is built at docs/prd/API.md section 12, step " + step + ".",
	}
}
