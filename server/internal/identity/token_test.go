package identity

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestVerifierAcceptsBetterAuthSubject(t *testing.T) {
	public, private := keypair(t)
	const origin = "https://accounts.example"
	verifier, err := NewVerifier(origin, "", jwksClient(t, func(int) map[string]any { return jwksBody("key-1", public) }))
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 10, 9, 12, 0, 0, 0, time.UTC)
	token := signedToken(t, private, "key-1", map[string]any{
		"sub": "account-1",
		"iss": origin,
		"aud": origin,
		"iat": now.Add(-time.Minute).Unix(),
		"exp": now.Add(14 * time.Minute).Unix(),
	})

	subject, err := verifier.Verify(context.Background(), token, now)
	if err != nil {
		t.Fatal(err)
	}
	if subject.AccountID != "account-1" {
		t.Fatalf("account ID = %q, want account-1", subject.AccountID)
	}
}

func TestVerifierNormalizesATrailingSlashOnTheIssuer(t *testing.T) {
	public, private := keypair(t)
	const origin = "https://accounts.example"
	verifier, err := NewVerifier(origin+"/", "", jwksClient(t, func(int) map[string]any { return jwksBody("key-1", public) }))
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 10, 9, 12, 0, 0, 0, time.UTC)
	token := signedToken(t, private, "key-1", map[string]any{
		"sub": "account-1", "iss": origin, "aud": origin, "exp": now.Add(time.Minute).Unix(),
	})
	if _, err := verifier.Verify(context.Background(), token, now); err != nil {
		t.Fatal(err)
	}
}

func TestVerifierRejectsTokenBoundaryFailures(t *testing.T) {
	public, private := keypair(t)
	const origin = "https://accounts.example"
	verifier, err := NewVerifier(origin, "", jwksClient(t, func(int) map[string]any { return jwksBody("key-1", public) }))
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 10, 9, 12, 0, 0, 0, time.UTC)
	cases := []struct {
		name   string
		claims map[string]any
		want   string
	}{
		{"expired", map[string]any{"sub": "account-1", "iss": origin, "aud": origin, "exp": now.Add(-time.Second).Unix()}, "expired"},
		{"wrong issuer", map[string]any{"sub": "account-1", "iss": "https://other.example", "aud": origin, "exp": now.Add(time.Minute).Unix()}, "issuer"},
		{"wrong audience", map[string]any{"sub": "account-1", "iss": origin, "aud": "https://other.example", "exp": now.Add(time.Minute).Unix()}, "audience"},
		{"missing subject", map[string]any{"iss": origin, "aud": origin, "exp": now.Add(time.Minute).Unix()}, "subject"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := verifier.Verify(context.Background(), signedToken(t, private, "key-1", tc.claims), now)
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("error = %v, want one naming %q", err, tc.want)
			}
		})
	}
}

func TestVerifierRefreshesJWKSForANewKey(t *testing.T) {
	oldPublic, _ := keypair(t)
	newPublic, newPrivate := keypair(t)
	requests := 0
	client := jwksClient(t, func(_ int) map[string]any {
		requests++
		key := oldPublic
		kid := "old-key"
		if requests > 1 {
			key = newPublic
			kid = "new-key"
		}
		return jwksBody(kid, key)
	})
	const origin = "https://accounts.example"
	verifier, err := NewVerifier(origin, "", client)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 10, 9, 12, 0, 0, 0, time.UTC)
	token := signedToken(t, newPrivate, "new-key", map[string]any{
		"sub": "account-1", "iss": origin, "aud": origin, "exp": now.Add(time.Minute).Unix(),
	})
	if _, err := verifier.Verify(context.Background(), token, now); err != nil {
		t.Fatal(err)
	}
	if requests != 2 {
		t.Fatalf("JWKS requests = %d, want 2: one initial read and one refresh for the new key", requests)
	}
}

func TestVerifierRereadsJWKSForUnknownKeyIDsAtMostOncePerInterval(t *testing.T) {
	public, _ := keypair(t)
	_, stranger := keypair(t)
	requests := 0
	client := jwksClient(t, func(request int) map[string]any {
		requests = request
		return jwksBody("key-1", public)
	})
	const origin = "https://accounts.example"
	verifier, err := NewVerifier(origin, "", client)
	if err != nil {
		t.Fatal(err)
	}
	start := time.Date(2026, 10, 9, 12, 0, 0, 0, time.UTC)
	verify := func(kid string, now time.Time) error {
		_, err := verifier.Verify(context.Background(), signedToken(t, stranger, kid, map[string]any{
			"sub": "account-1", "iss": origin, "aud": origin, "exp": now.Add(time.Minute).Unix(),
		}), now)
		return err
	}

	steps := []struct {
		name     string
		kid      string
		at       time.Duration
		requests int
	}{
		{"the first unknown key ID re-reads", "unknown-1", 0, 2},
		{"another inside the interval does not", "unknown-2", time.Second, 2},
		{"nor one just before the interval ends", "unknown-3", unknownKeyRefreshInterval - time.Nanosecond, 2},
		{"one at the end of the interval re-reads again", "unknown-4", unknownKeyRefreshInterval, 3},
	}
	for _, step := range steps {
		err := verify(step.kid, start.Add(step.at))
		if err == nil || !strings.Contains(err.Error(), step.kid) {
			t.Fatalf("%s: error = %v, want a refusal naming %q", step.name, err, step.kid)
		}
		if requests != step.requests {
			t.Fatalf("%s: JWKS requests = %d, want %d", step.name, requests, step.requests)
		}
	}
}

func TestVerifierConcurrentTokensForANewKeyShareOneReread(t *testing.T) {
	oldPublic, _ := keypair(t)
	newPublic, newPrivate := keypair(t)
	requests := 0
	client := jwksClient(t, func(request int) map[string]any {
		requests = request
		if request == 1 {
			return jwksBody("old-key", oldPublic)
		}
		// Held open so the other tokens arrive while this re-read is in flight.
		time.Sleep(50 * time.Millisecond)
		return jwksBody("new-key", newPublic)
	})
	const origin = "https://accounts.example"
	verifier, err := NewVerifier(origin, "", client)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 10, 9, 12, 0, 0, 0, time.UTC)
	token := signedToken(t, newPrivate, "new-key", map[string]any{
		"sub": "account-1", "iss": origin, "aud": origin, "exp": now.Add(time.Minute).Unix(),
	})
	var wg sync.WaitGroup
	for range 16 {
		wg.Go(func() {
			if _, err := verifier.Verify(context.Background(), token, now); err != nil {
				t.Errorf("a token for the newly published key was refused: %v", err)
			}
		})
	}
	wg.Wait()
	if requests != 2 {
		t.Fatalf("JWKS requests = %d, want 2: one initial read and one re-read shared by 16 tokens", requests)
	}
}

func TestBearerTokenNamesMalformedAuthorization(t *testing.T) {
	for _, header := range []string{"", "Basic value", "Bearer", "Bearer one two"} {
		t.Run(fmt.Sprintf("%q", header), func(t *testing.T) {
			if _, err := BearerToken(header); err == nil {
				t.Fatalf("BearerToken(%q) succeeded, want a refusal", header)
			}
		})
	}
	if token, err := BearerToken("Bearer signed-token"); err != nil || token != "signed-token" {
		t.Fatalf("BearerToken(valid) = %q, %v", token, err)
	}
}

func TestMiddlewareKeepsPublicRequestsPublicAndVerifiesBearerTokens(t *testing.T) {
	public, private := keypair(t)
	const origin = "https://accounts.example"
	verifier, err := NewVerifier(origin, "", jwksClient(t, func(int) map[string]any { return jwksBody("key-1", public) }))
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 10, 9, 12, 0, 0, 0, time.UTC)
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		subject, ok := SubjectFromContext(r.Context())
		if ok {
			w.Header().Set("X-Account", subject.AccountID)
		}
		w.WriteHeader(http.StatusNoContent)
	})
	handler := verifier.Middleware(next, func() time.Time { return now })

	publicRequest := httptest.NewRequest(http.MethodGet, "/v1/status", nil)
	publicResponse := httptest.NewRecorder()
	handler.ServeHTTP(publicResponse, publicRequest)
	if publicResponse.Code != http.StatusNoContent || publicResponse.Header().Get("X-Account") != "" {
		t.Fatalf("public request = HTTP %d with account %q", publicResponse.Code, publicResponse.Header().Get("X-Account"))
	}

	token := signedToken(t, private, "key-1", map[string]any{
		"sub": "account-1", "iss": origin, "aud": origin, "exp": now.Add(time.Minute).Unix(),
	})
	authenticatedRequest := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
	authenticatedRequest.Header.Set("Authorization", "Bearer "+token)
	authenticatedResponse := httptest.NewRecorder()
	handler.ServeHTTP(authenticatedResponse, authenticatedRequest)
	if authenticatedResponse.Code != http.StatusNoContent || authenticatedResponse.Header().Get("X-Account") != "account-1" {
		t.Fatalf("authenticated request = HTTP %d with account %q", authenticatedResponse.Code, authenticatedResponse.Header().Get("X-Account"))
	}

	refusedRequest := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
	refusedRequest.Header.Set("Authorization", "Bearer not-a-token")
	refusedResponse := httptest.NewRecorder()
	handler.ServeHTTP(refusedResponse, refusedRequest)
	if refusedResponse.Code != http.StatusUnauthorized {
		t.Fatalf("malformed token = HTTP %d, want 401", refusedResponse.Code)
	}
	if refusedResponse.Header().Get("WWW-Authenticate") == "" {
		t.Fatal("malformed token response has no WWW-Authenticate challenge")
	}
	if strings.Contains(refusedResponse.Body.String(), "not-a-token") || strings.Contains(refusedResponse.Body.String(), "/api/auth/jwks") {
		t.Fatalf("malformed token response exposes verifier internals: %s", refusedResponse.Body.String())
	}
}

func keypair(t *testing.T) (ed25519.PublicKey, ed25519.PrivateKey) {
	t.Helper()
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return public, private
}

type roundTrip func(*http.Request) (*http.Response, error)

func (f roundTrip) RoundTrip(request *http.Request) (*http.Response, error) {
	return f(request)
}

func jwksClient(t *testing.T, document func(request int) map[string]any) *http.Client {
	t.Helper()
	requests := 0
	return &http.Client{Transport: roundTrip(func(request *http.Request) (*http.Response, error) {
		requests++
		if request.URL.String() != "https://accounts.example/api/auth/jwks" {
			t.Fatalf("JWKS request URL = %q", request.URL)
		}
		encoded, err := json.Marshal(document(requests))
		if err != nil {
			t.Fatal(err)
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(string(encoded))),
			Request:    request,
		}, nil
	})}
}

func jwksBody(kid string, public ed25519.PublicKey) map[string]any {
	return map[string]any{"keys": []map[string]string{{
		"kid": kid, "kty": "OKP", "crv": "Ed25519", "alg": "EdDSA", "x": base64.RawURLEncoding.EncodeToString(public),
	}}}
}

func signedToken(t *testing.T, private ed25519.PrivateKey, kid string, claims map[string]any) string {
	t.Helper()
	header, err := json.Marshal(map[string]string{"alg": "EdDSA", "kid": kid, "typ": "JWT"})
	if err != nil {
		t.Fatal(err)
	}
	payload, err := json.Marshal(claims)
	if err != nil {
		t.Fatal(err)
	}
	encoded := base64.RawURLEncoding.EncodeToString(header) + "." + base64.RawURLEncoding.EncodeToString(payload)
	signature := ed25519.Sign(private, []byte(encoded))
	return encoded + "." + base64.RawURLEncoding.EncodeToString(signature)
}
