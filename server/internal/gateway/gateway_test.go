package gateway_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	"github.com/BeyndtechArc/Seametry/server/internal/gateway"
	"github.com/BeyndtechArc/Seametry/server/internal/gateway/api"
)

// stepPattern matches "step A3", "step F1" and similar: every stub's detail
// must name the docs/prd/API.md section 12 row that builds it, not just say
// "not built."
var stepPattern = regexp.MustCompile(`step [A-Z]\d`)

func newTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(gateway.NewHandler(gateway.Server{}))
	t.Cleanup(srv.Close)
	return srv
}

func TestStatusAnswersInTheEnvelope(t *testing.T) {
	srv := newTestServer(t)
	resp, err := http.Get(srv.URL + "/v1/status")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /v1/status = %d, want 200", resp.StatusCode)
	}
	var body struct {
		Data api.StatusReport `json:"data"`
		Meta api.Meta         `json:"meta"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decoding the response: %v", err)
	}
	if body.Meta.Completeness != api.Complete {
		t.Errorf("completeness = %q, want %q: nothing is instrumented yet, so an empty sources list is the whole truth, not a gap in it", body.Meta.Completeness, api.Complete)
	}
	if body.Data.Sources == nil {
		t.Error("sources is null, want an empty array: an empty list is stated, never omitted (docs/prd/API.md section 13)")
	}
}

// TestEveryOtherOperationAnswers501NamingAStep is docs/prd/API.md section 12
// step A1's own text: "Every generated operation with no handler yet answers
// 501, naming the step that builds it, never an empty 200." Six operations
// this originally listed are real as of A3 (instruments_test.go and
// policy_handlers_test.go now check them) and are gone from this list, not
// silently left to a stale expectation.
func TestEveryOtherOperationAnswers501NamingAStep(t *testing.T) {
	srv := newTestServer(t)
	cases := []struct {
		method, path string
	}{
		{"GET", "/v1/alloys/addr/nav"},
		{"GET", "/v1/anchor-keys"},
		{"GET", "/v1/batches/root"},
		{"GET", "/v1/findings"},
		{"GET", "/v1/findings/slug"},
		{"POST", "/v1/formulas/evaluate"},
		{"GET", "/v1/receipts/serial"},
		{"GET", "/v1/stream"},
	}
	for _, c := range cases {
		t.Run(c.method+" "+c.path, func(t *testing.T) {
			req, err := http.NewRequest(c.method, srv.URL+c.path, nil)
			if err != nil {
				t.Fatal(err)
			}
			if c.method == "POST" {
				// A real, if empty, JSON body: the generated strict handler
				// decodes the body before this test's target, the stub, ever
				// runs, and a decode failure would be a 400 from a different
				// layer, not the 501 this test is checking for.
				req.Body = io.NopCloser(strings.NewReader("{}"))
				req.Header.Set("Content-Type", "application/json")
			}
			resp, err := srv.Client().Do(req)
			if err != nil {
				t.Fatal(err)
			}
			defer resp.Body.Close()
			if resp.StatusCode != http.StatusNotImplemented {
				t.Fatalf("%s %s = %d, want %d (never an empty 200)", c.method, c.path, resp.StatusCode, http.StatusNotImplemented)
			}
			if ct := resp.Header.Get("Content-Type"); ct != "application/problem+json" {
				t.Errorf("Content-Type = %q, want application/problem+json", ct)
			}
			var problem api.Problem
			if err := json.NewDecoder(resp.Body).Decode(&problem); err != nil {
				t.Fatalf("decoding the problem body: %v", err)
			}
			if problem.Status != http.StatusNotImplemented {
				t.Errorf("problem.status = %d, want %d", problem.Status, http.StatusNotImplemented)
			}
			if !stepPattern.MatchString(problem.Detail) {
				t.Errorf("detail %q does not name a docs/prd/API.md section 12 step", problem.Detail)
			}
		})
	}
}

func TestABadParameterAnswersAsAProblemNotPlainText(t *testing.T) {
	srv := newTestServer(t)
	resp, err := http.Get(srv.URL + "/v1/instruments/mint?as_of=not-a-date")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "application/problem+json" {
		t.Errorf("Content-Type = %q, want application/problem+json: a parameter that fails to bind is caught by a different hook than a strict-handler error, and both need the same RFC 9457 treatment", ct)
	}
	var problem api.Problem
	if err := json.NewDecoder(resp.Body).Decode(&problem); err != nil {
		t.Fatalf("decoding the problem body: %v", err)
	}
	if problem.Detail == "" {
		t.Error("detail is empty, want the value, the expectation and where it came from (AGENTS.md: errors say what to do)")
	}
}

func TestCORSAllowsAnyOriginWithNoCredentials(t *testing.T) {
	srv := newTestServer(t)
	req, err := http.NewRequest(http.MethodOptions, srv.URL+"/v1/status", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Origin", "https://example.com")
	req.Header.Set("Access-Control-Request-Method", "GET")
	resp, err := srv.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("OPTIONS preflight = %d, want 204", resp.StatusCode)
	}
	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "*" {
		t.Errorf("Access-Control-Allow-Origin = %q, want %q (docs/prd/API.md section 7: public reads allow any origin without credentials)", got, "*")
	}
	if resp.Header.Get("Access-Control-Allow-Credentials") != "" {
		t.Error("Access-Control-Allow-Credentials is set; public reads must not claim credentialed access")
	}
}
