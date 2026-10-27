package gateway_test

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/execution"
	"github.com/BeyndtechArc/Seametry/server/internal/gateway"
	"github.com/BeyndtechArc/Seametry/server/internal/identity"
)

const linkedWallet = "FFyrQgpU4BQ2FLesy6t5MmPUDimPj2ghwChTMrLBN5DM"

// historyHandler is the Gateway with an account verifier whose key signs
// the tokens sign returns, claiming whatever wallets the test names.
func historyHandler(t *testing.T, held *heldReports, now time.Time) (http.Handler, func(wallets ...string) string) {
	t.Helper()
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	const origin = "https://accounts.example"
	keySet, err := json.Marshal(map[string]any{"keys": []map[string]string{{
		"kid": "key-1", "kty": "OKP", "crv": "Ed25519", "alg": "EdDSA", "x": base64.RawURLEncoding.EncodeToString(public),
	}}})
	if err != nil {
		t.Fatal(err)
	}
	client := &http.Client{Transport: accountRoundTrip(func(request *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(string(keySet))), Request: request}, nil
	})}
	verifier, err := identity.NewVerifier(origin, "https://accounts.example/api/auth/jwks", client)
	if err != nil {
		t.Fatal(err)
	}
	core := gateway.NewServer(nil, nil).WithActivity(held)
	core.Now = func() time.Time { return now }
	handler := gateway.NewHandler(core, gateway.ServiceSecret(reportSecret), func(next http.Handler) http.Handler {
		return verifier.Middleware(next, func() time.Time { return now })
	})
	sign := func(wallets ...string) string {
		header, _ := json.Marshal(map[string]string{"alg": "EdDSA", "kid": "key-1", "typ": "JWT"})
		payload, _ := json.Marshal(map[string]any{"sub": "account-1", "iss": origin, "aud": origin, "exp": now.Add(time.Minute).Unix(), "wallets": wallets})
		encoded := base64.RawURLEncoding.EncodeToString(header) + "." + base64.RawURLEncoding.EncodeToString(payload)
		return encoded + "." + base64.RawURLEncoding.EncodeToString(ed25519.Sign(private, []byte(encoded)))
	}
	return handler, sign
}

func getActivity(handler http.Handler, path, token string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodGet, path, nil)
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func TestMyActivityReadsOnlyTheWalletsTheAccountTokenNames(t *testing.T) {
	now := time.Date(2026, 10, 27, 12, 0, 0, 0, time.UTC)
	scale := 8
	landedAt := now.Add(-time.Hour)
	held := &heldReports{history: []execution.HistoryQuote{{
		ID: [16]byte{1}, Wallet: linkedWallet, Kind: "buy", Subject: "Prime Seven", PlanSize: 7, PreparedAt: now.Add(-2 * time.Hour), Source: "server",
		Legs: []execution.HistoryLeg{
			{ID: [16]byte{2}, Mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", Symbol: "NVDAx", Source: "server", Signature: "sig-landed", SubmittedAt: now.Add(-2 * time.Hour), SubmitResult: "sent",
				In: &execution.Amount{Atoms: "1000000", Scale: 6}, Chain: &execution.ChainAnswer{Outcome: "landed", BlockTime: &landedAt, ReconciledAt: landedAt, WalletUSDCDelta: "-1000000", WalletTokenDelta: "450000", TokenScale: &scale}},
			{ID: [16]byte{3}, Mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", Symbol: "AAPLx", Source: "server", Signature: "sig-open", SubmittedAt: now.Add(-2 * time.Hour), SubmitResult: "sent",
				In: &execution.Amount{Atoms: "1000000", Scale: 6}},
		},
	}}}
	handler, sign := historyHandler(t, held, now)

	if response := getActivity(handler, "/v1/me/activity", ""); response.Code != http.StatusUnauthorized {
		t.Fatalf("no account token: got %d, want 401", response.Code)
	}
	if len(held.historyOf) != 0 {
		t.Fatalf("a request without an account token read the record for %v", held.historyOf)
	}

	// An address in the query is not a way in: only the token names wallets.
	response := getActivity(handler, "/v1/me/activity?wallet=4vJ9JU1bJJE96FWSJKvHsmmFZjwQXW8UTQpLzMAnX1d", sign(linkedWallet))
	if response.Code != http.StatusOK {
		t.Fatalf("GET /v1/me/activity = %d: %s", response.Code, response.Body.String())
	}
	if len(held.historyOf) != 1 || len(held.historyOf[0]) != 1 || held.historyOf[0][0] != linkedWallet {
		t.Fatalf("the record was read for %v, want exactly [%s]", held.historyOf, linkedWallet)
	}
	var body struct {
		Data struct {
			Wallets    []string `json:"wallets"`
			Executions []struct {
				Source string `json:"source"`
				Legs   []struct {
					Signature string          `json:"signature"`
					Chain     json.RawMessage `json:"chain"`
				} `json:"legs"`
			} `json:"executions"`
		} `json:"data"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	legs := body.Data.Executions[0].Legs
	if !strings.Contains(string(legs[0].Chain), `"outcome":"landed"`) || !strings.Contains(string(legs[0].Chain), `"wallet_token_delta":"450000"`) {
		t.Fatalf("the landed leg's chain answer: %s", legs[0].Chain)
	}
	if legs[1].Chain != nil {
		t.Fatalf("a leg the chain has not answered for must carry no chain answer, got %s", legs[1].Chain)
	}

	held.historyOf = nil
	response = getActivity(handler, "/v1/me/activity", sign())
	if response.Code != http.StatusOK || len(held.historyOf) != 1 || len(held.historyOf[0]) != 0 {
		t.Fatalf("an account with no linked wallet: got %d reading %v, want 200 reading no wallet", response.Code, held.historyOf)
	}
}
