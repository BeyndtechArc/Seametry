package gateway_test

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/gateway"
	"github.com/BeyndtechArc/Seametry/server/internal/identity"
)

type accountRoundTrip func(*http.Request) (*http.Response, error)

func (f accountRoundTrip) RoundTrip(request *http.Request) (*http.Response, error) {
	return f(request)
}

type heldJoins struct {
	joined chan identity.Subject
	err    error
}

func (h heldJoins) Join(_ context.Context, subject identity.Subject, _ time.Time) error {
	h.joined <- subject
	return h.err
}

func TestAVerifiedAccountJoinsGrowthAndAFailedJoinCannotFailTheRequest(t *testing.T) {
	verifier, token, now := accountVerifier(t)
	held := heldJoins{joined: make(chan identity.Subject, 1), err: errors.New("the record is down")}
	reached := false
	handler := verifier.Middleware(gateway.JoinAccounts(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		reached = true
		w.WriteHeader(http.StatusNoContent)
	}), held), func() time.Time { return now })
	request := httptest.NewRequest(http.MethodGet, "/v1/anything", nil)
	request.Header.Set("Authorization", "Bearer "+token)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if !reached || response.Code != http.StatusNoContent {
		t.Fatalf("reached %t, HTTP %d; a failed join must leave the request alone", reached, response.Code)
	}
	select {
	case subject := <-held.joined:
		if subject.AccountID != "account-1" {
			t.Errorf("joined %q, want the token's subject", subject.AccountID)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("the verified account never reached Growth")
	}
}

func TestARequestWithoutAnAccountJoinsNothing(t *testing.T) {
	held := heldJoins{joined: make(chan identity.Subject, 1)}
	handler := gateway.JoinAccounts(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}), held)
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/v1/anything", nil))
	select {
	case subject := <-held.joined:
		t.Errorf("a request with no token joined %+v", subject)
	case <-time.After(50 * time.Millisecond):
	}
}

func accountVerifier(t *testing.T) (*identity.Verifier, string, time.Time) {
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
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(string(keySet))),
			Request:    request,
		}, nil
	})}
	verifier, err := identity.NewVerifier(origin, "https://accounts.example/api/auth/jwks", client)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 10, 9, 12, 0, 0, 0, time.UTC)
	return verifier, accountToken(t, private, now, origin), now
}

func TestAccountTokenReachesTheGatewayAsAnOpaqueSubject(t *testing.T) {
	verifier, token, now := accountVerifier(t)
	core := gateway.NewServer(nil, nil)
	core.Now = func() time.Time { return now }
	handler := gateway.NewHandler(core, func(next http.Handler) http.Handler {
		return verifier.Middleware(next, func() time.Time { return now })
	})
	request := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
	request.Header.Set("Authorization", "Bearer "+token)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("GET /v1/me = HTTP %d: %s", response.Code, response.Body.String())
	}
	var body struct {
		Data struct {
			ID          string   `json:"id"`
			AuthMethods []string `json:"auth_methods"`
			KYCLevel    string   `json:"kyc_level"`
		} `json:"data"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Data.ID != "account-1" {
		t.Fatalf("account ID = %q, want account-1", body.Data.ID)
	}
	if strings.Join(body.Data.AuthMethods, ",") != "solana,google" || body.Data.KYCLevel != "none" {
		t.Fatalf("account methods %v and KYC level %q, want [solana google] and none", body.Data.AuthMethods, body.Data.KYCLevel)
	}
	if strings.Contains(response.Body.String(), "holder@example.com") {
		t.Fatalf("account response exposes a profile field: %s", response.Body.String())
	}

	refusedRequest := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
	refusedRequest.Header.Set("Origin", "https://seametry.xyz")
	refusedRequest.Header.Set("Authorization", "Bearer expired-or-malformed")
	refusedResponse := httptest.NewRecorder()
	handler.ServeHTTP(refusedResponse, refusedRequest)
	if refusedResponse.Code != http.StatusUnauthorized {
		t.Fatalf("refused account token = HTTP %d, want 401", refusedResponse.Code)
	}
	if refusedResponse.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("refused account token has no readable CORS response: %#v", refusedResponse.Header())
	}
}

func accountToken(t *testing.T, private ed25519.PrivateKey, now time.Time, origin string) string {
	t.Helper()
	header, err := json.Marshal(map[string]string{"alg": "EdDSA", "kid": "key-1", "typ": "JWT"})
	if err != nil {
		t.Fatal(err)
	}
	payload, err := json.Marshal(map[string]any{
		"sub": "account-1", "iss": origin, "aud": origin, "iat": now.Unix(), "exp": now.Add(time.Minute).Unix(),
		"auth_methods": []string{"solana", "google"},
	})
	if err != nil {
		t.Fatal(err)
	}
	encoded := base64.RawURLEncoding.EncodeToString(header) + "." + base64.RawURLEncoding.EncodeToString(payload)
	return encoded + "." + base64.RawURLEncoding.EncodeToString(ed25519.Sign(private, []byte(encoded)))
}
