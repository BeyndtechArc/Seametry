// Package identity verifies the short-lived subject tokens issued by the
// Better Auth account authority. It never reads the account database.
package identity

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/base58"
)

const maxTokenBytes = 16 * 1024

// unknownKeyRefreshInterval bounds how often a token naming an unpublished key
// ID makes the Gateway re-read the JWKS. Any anonymous caller can mint such a
// token, and without a bound each one cost a synchronous request to the auth
// service before it was refused. A rotated key is still picked up by the
// first token that names it; one arriving within the interval after a re-read
// is refused until the interval passes.
const unknownKeyRefreshInterval = 30 * time.Second

type Subject struct {
	AccountID string
	// Wallets are the addresses the account authority had seen this account
	// prove it controls when it issued the token. A wallet unlinked since
	// stays here until the token expires.
	Wallets []string
	// Email is the address the account signed in with, and EmailVerified
	// whether its provider said it verified it. Only the admin gate reads
	// them; a token without the claims reads as an unverified empty address.
	Email         string
	EmailVerified bool
	// AuthMethods names how the account can sign in (solana, google, email),
	// in the authority's order, unknown names dropped. KYCLevel is "none"
	// until a verification provider exists; a level this Gateway does not
	// know reads as none, so a new level never grants anything here first.
	AuthMethods []string
	KYCLevel    string
}

// KYCNone is the only KYC level the account authority issues today.
const KYCNone = "none"

// knownAuthMethods are the sign-in method names the account authority sends.
var knownAuthMethods = map[string]bool{"solana": true, "google": true, "email": true}

var knownKYCLevels = map[string]bool{KYCNone: true}

// maxTokenAuthMethods bounds the claim well above the methods that exist.
const maxTokenAuthMethods = 8

// maxTokenEmailBytes is RFC 5321's limit on a forward path.
const maxTokenEmailBytes = 254

// maxTokenWallets matches the account authority's cap on the claim.
const maxTokenWallets = 20

type subjectContextKey struct{}

type Verifier struct {
	issuer  string
	jwksURL string
	client  *http.Client
	mu      sync.RWMutex
	keys    map[string]ed25519.PublicKey

	// unknownKeyMu is held across a re-read, so concurrent tokens with unknown
	// key IDs wait for one fetch instead of each starting their own.
	unknownKeyMu        sync.Mutex
	unknownKeyRefreshed time.Time
}

type tokenHeader struct {
	Algorithm string `json:"alg"`
	KeyID     string `json:"kid"`
}

type tokenClaims struct {
	Subject   string          `json:"sub"`
	Issuer    string          `json:"iss"`
	Audience  json.RawMessage `json:"aud"`
	ExpiresAt json.Number     `json:"exp"`
	NotBefore json.Number     `json:"nbf"`
	Wallets   []string        `json:"wallets"`
	Email     string          `json:"email"`
	// A pointer, so a claim sent as anything but a JSON boolean fails to
	// decode instead of reading as false or true.
	EmailVerified *bool `json:"email_verified"`
	// A claim of the wrong JSON type fails to decode, and refuses the token.
	AuthMethods []string `json:"auth_methods"`
	KYCLevel    *string  `json:"kyc_level"`
}

type jwksDocument struct {
	Keys []struct {
		KeyID     string `json:"kid"`
		KeyType   string `json:"kty"`
		Curve     string `json:"crv"`
		Algorithm string `json:"alg"`
		X         string `json:"x"`
	} `json:"keys"`
}

func NewVerifier(authOrigin, keySetURL string, client *http.Client) (*Verifier, error) {
	origin, err := url.Parse(strings.TrimSpace(authOrigin))
	if err != nil || origin.Scheme == "" || origin.Host == "" || (origin.Path != "" && origin.Path != "/") || origin.RawQuery != "" || origin.Fragment != "" || origin.User != nil {
		return nil, fmt.Errorf("identity: auth origin %q must be an HTTP(S) origin without a path", authOrigin)
	}
	if origin.Scheme != "http" && origin.Scheme != "https" {
		return nil, fmt.Errorf("identity: auth origin %q must use HTTP or HTTPS", authOrigin)
	}
	if client == nil {
		client = &http.Client{Timeout: 5 * time.Second}
	}
	if keySetURL == "" {
		keySetURL = strings.TrimSuffix(origin.String(), "/") + "/api/auth/jwks"
	}
	parsedKeySetURL, err := url.Parse(keySetURL)
	if err != nil || parsedKeySetURL.Scheme == "" || parsedKeySetURL.Host == "" || (parsedKeySetURL.Scheme != "http" && parsedKeySetURL.Scheme != "https") {
		return nil, fmt.Errorf("identity: JWKS URL %q must be an absolute HTTP(S) URL", keySetURL)
	}
	v := &Verifier{
		issuer:  strings.TrimSuffix(origin.String(), "/"),
		jwksURL: parsedKeySetURL.String(),
		client:  client,
		keys:    make(map[string]ed25519.PublicKey),
	}
	if err := v.refresh(context.Background()); err != nil {
		return nil, err
	}
	return v, nil
}

func BearerToken(authorization string) (string, error) {
	parts := strings.Fields(authorization)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || parts[1] == "" {
		return "", errors.New("identity: Authorization must be one Bearer token")
	}
	return parts[1], nil
}

func (v *Verifier) Middleware(next http.Handler, now func() time.Time) http.Handler {
	if now == nil {
		now = time.Now
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authorization := r.Header.Get("Authorization")
		if authorization == "" {
			next.ServeHTTP(w, r)
			return
		}
		token, err := BearerToken(authorization)
		if err == nil {
			var subject Subject
			subject, err = v.Verify(r.Context(), token, now().UTC())
			if err == nil {
				next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), subjectContextKey{}, subject)))
				return
			}
		}
		w.Header().Set("Content-Type", "application/problem+json")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("WWW-Authenticate", `Bearer realm="Seametry Gateway"`)
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]any{
			"type":   "https://seametry.xyz/problems/account-token",
			"title":  "Account token refused",
			"status": http.StatusUnauthorized,
			"detail": "Request a new account token, then retry this Gateway call.",
		})
	})
}

func SubjectFromContext(ctx context.Context) (Subject, bool) {
	subject, ok := ctx.Value(subjectContextKey{}).(Subject)
	return subject, ok && subject.AccountID != ""
}

func (v *Verifier) Verify(ctx context.Context, encoded string, now time.Time) (Subject, error) {
	if len(encoded) == 0 || len(encoded) > maxTokenBytes {
		return Subject{}, fmt.Errorf("identity: token length is %d bytes, expected 1 through %d", len(encoded), maxTokenBytes)
	}
	parts := strings.Split(encoded, ".")
	if len(parts) != 3 {
		return Subject{}, errors.New("identity: token must contain three dot-separated sections")
	}

	var header tokenHeader
	if err := decodeJSONPart(parts[0], &header); err != nil {
		return Subject{}, fmt.Errorf("identity: token header: %w", err)
	}
	if header.Algorithm != "EdDSA" {
		return Subject{}, fmt.Errorf("identity: token algorithm is %q, expected EdDSA", header.Algorithm)
	}
	if header.KeyID == "" {
		return Subject{}, errors.New("identity: token header has no key ID")
	}

	key := v.key(header.KeyID)
	if key == nil {
		var err error
		if key, err = v.keyAfterRefresh(ctx, header.KeyID, now); err != nil {
			return Subject{}, err
		}
	}

	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil || len(signature) != ed25519.SignatureSize {
		return Subject{}, errors.New("identity: token signature is not a 64-byte base64url Ed25519 signature")
	}
	if !ed25519.Verify(key, []byte(parts[0]+"."+parts[1]), signature) {
		return Subject{}, errors.New("identity: token signature does not match its published key")
	}

	var claims tokenClaims
	if err := decodeJSONPart(parts[1], &claims); err != nil {
		return Subject{}, fmt.Errorf("identity: token claims: %w", err)
	}
	if claims.Issuer != v.issuer {
		return Subject{}, fmt.Errorf("identity: token issuer is %q, expected %q", claims.Issuer, v.issuer)
	}
	if !hasAudience(claims.Audience, v.issuer) {
		return Subject{}, fmt.Errorf("identity: token audience does not include %q", v.issuer)
	}
	if claims.Subject == "" {
		return Subject{}, errors.New("identity: token subject is empty")
	}
	expiresAt, err := claims.ExpiresAt.Int64()
	if err != nil {
		return Subject{}, errors.New("identity: token expiration is missing or is not Unix seconds")
	}
	if now.Unix() >= expiresAt {
		return Subject{}, fmt.Errorf("identity: token expired at %s", time.Unix(expiresAt, 0).UTC().Format(time.RFC3339))
	}
	if claims.NotBefore != "" {
		notBefore, err := claims.NotBefore.Int64()
		if err != nil {
			return Subject{}, errors.New("identity: token not-before value is not Unix seconds")
		}
		if now.Unix() < notBefore {
			return Subject{}, fmt.Errorf("identity: token is not active until %s", time.Unix(notBefore, 0).UTC().Format(time.RFC3339))
		}
	}
	if len(claims.Wallets) > maxTokenWallets {
		return Subject{}, fmt.Errorf("identity: token names %d wallets, expected at most %d", len(claims.Wallets), maxTokenWallets)
	}
	for index, wallet := range claims.Wallets {
		if decoded, err := base58.Decode(wallet); err != nil || len(decoded) != 32 {
			return Subject{}, fmt.Errorf("identity: token wallets[%d] %q is not a 32-byte base58 Solana address", index, wallet)
		}
	}
	if len(claims.Email) > maxTokenEmailBytes {
		return Subject{}, fmt.Errorf("identity: token email is %d bytes, expected at most %d", len(claims.Email), maxTokenEmailBytes)
	}
	if len(claims.AuthMethods) > maxTokenAuthMethods {
		return Subject{}, fmt.Errorf("identity: token names %d sign-in methods, expected at most %d", len(claims.AuthMethods), maxTokenAuthMethods)
	}
	methods := make([]string, 0, len(claims.AuthMethods))
	for _, method := range claims.AuthMethods {
		if knownAuthMethods[method] && !slices.Contains(methods, method) {
			methods = append(methods, method)
		}
	}
	kyc := KYCNone
	if claims.KYCLevel != nil && knownKYCLevels[*claims.KYCLevel] {
		kyc = *claims.KYCLevel
	}
	verified := claims.EmailVerified != nil && *claims.EmailVerified && claims.Email != ""
	return Subject{AccountID: claims.Subject, Wallets: claims.Wallets, Email: claims.Email, EmailVerified: verified, AuthMethods: methods, KYCLevel: kyc}, nil
}

func (v *Verifier) key(id string) ed25519.PublicKey {
	v.mu.RLock()
	defer v.mu.RUnlock()
	return v.keys[id]
}

// keyAfterRefresh re-reads the JWKS for a key ID the verifier does not hold,
// at most once per unknownKeyRefreshInterval measured on now. The attempt is
// recorded before the fetch, so an unreachable auth service is not retried by
// every request either.
func (v *Verifier) keyAfterRefresh(ctx context.Context, id string, now time.Time) (ed25519.PublicKey, error) {
	v.unknownKeyMu.Lock()
	defer v.unknownKeyMu.Unlock()
	if key := v.key(id); key != nil {
		return key, nil
	}
	if !v.unknownKeyRefreshed.IsZero() && now.Before(v.unknownKeyRefreshed.Add(unknownKeyRefreshInterval)) {
		return nil, fmt.Errorf("identity: token key ID %q is not among the held signing keys, which an unknown key ID last re-read at %s; the next re-read is allowed at %s", id, v.unknownKeyRefreshed.UTC().Format(time.RFC3339), v.unknownKeyRefreshed.Add(unknownKeyRefreshInterval).UTC().Format(time.RFC3339))
	}
	v.unknownKeyRefreshed = now
	if err := v.refresh(ctx); err != nil {
		return nil, fmt.Errorf("identity: refreshing signing keys for key ID %q: %w", id, err)
	}
	if key := v.key(id); key != nil {
		return key, nil
	}
	return nil, fmt.Errorf("identity: token key ID %q is not published by the account authority", id)
}

func (v *Verifier) refresh(ctx context.Context) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, v.jwksURL, nil)
	if err != nil {
		return fmt.Errorf("identity: constructing the JWKS request: %w", err)
	}
	response, err := v.client.Do(request)
	if err != nil {
		return fmt.Errorf("identity: reading %s: %w", v.jwksURL, err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("identity: reading %s returned HTTP %d", v.jwksURL, response.StatusCode)
	}
	var document jwksDocument
	decoder := json.NewDecoder(io.LimitReader(response.Body, 1<<20))
	if err := decoder.Decode(&document); err != nil {
		return fmt.Errorf("identity: decoding %s: %w", v.jwksURL, err)
	}
	keys := make(map[string]ed25519.PublicKey)
	for _, candidate := range document.Keys {
		if candidate.KeyID == "" || candidate.KeyType != "OKP" || candidate.Curve != "Ed25519" || candidate.Algorithm != "EdDSA" {
			continue
		}
		decoded, err := base64.RawURLEncoding.DecodeString(candidate.X)
		if err != nil || len(decoded) != ed25519.PublicKeySize {
			continue
		}
		keys[candidate.KeyID] = ed25519.PublicKey(decoded)
	}
	if len(keys) == 0 {
		return fmt.Errorf("identity: %s published no usable Ed25519 signing keys", v.jwksURL)
	}
	v.mu.Lock()
	v.keys = keys
	v.mu.Unlock()
	return nil
}

func decodeJSONPart(encoded string, target any) error {
	decoded, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return errors.New("value is not base64url")
	}
	decoder := json.NewDecoder(strings.NewReader(string(decoded)))
	decoder.UseNumber()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	return nil
}

func hasAudience(raw json.RawMessage, expected string) bool {
	var one string
	if json.Unmarshal(raw, &one) == nil {
		return one == expected
	}
	var many []string
	if json.Unmarshal(raw, &many) != nil {
		return false
	}
	for _, audience := range many {
		if audience == expected {
			return true
		}
	}
	return false
}
