package solana

import (
	"strings"
	"testing"
)

// Every artifact this repository writes is committed, so a credential reaching
// one is a breach rather than a blemish. These are the shapes providers
// actually use.
func TestRedactEndpointRemovesCredentials(t *testing.T) {
	for _, c := range []struct{ name, endpoint, secret string }{
		{"key in query", "https://mainnet.helius-rpc.com/?api-key=sk_live_abc123XYZ", "sk_live_abc123XYZ"},
		{"key in path", "https://solana-mainnet.g.alchemy.com/v2/AbCdEf123456", "AbCdEf123456"},
		{"key in path and query", "https://rpc.example.com/v1/tok_9f2b?auth=zzz999", "tok_9f2b"},
		{"basic auth in userinfo", "https://user:hunter2@rpc.example.com/", "hunter2"},
		{"multiple params", "https://rpc.example.com/?a=1&api_key=SECRET&b=2", "SECRET"},
	} {
		t.Run(c.name, func(t *testing.T) {
			got := RedactEndpoint(c.endpoint)
			if strings.Contains(got, c.secret) {
				t.Fatalf("the redacted endpoint still carries the credential\n  got %s\n  secret %s", got, c.secret)
			}
			if !strings.Contains(got, "redacted") {
				t.Errorf("redaction should say so: %s", got)
			}
		})
	}
}

func TestRedactEndpointKeepsTheHost(t *testing.T) {
	got := RedactEndpoint("https://mainnet.helius-rpc.com/?api-key=secret")
	if !strings.Contains(got, "mainnet.helius-rpc.com") {
		t.Errorf("the host is safe to publish and useful to keep: %s", got)
	}
}

func TestRedactEndpointHandlesRubbish(t *testing.T) {
	for _, endpoint := range []string{"", "not a url", "::::", "/relative/only"} {
		got := RedactEndpoint(endpoint)
		if got != "redacted" {
			t.Errorf("RedactEndpoint(%q) = %q, want a plain refusal", endpoint, got)
		}
	}
}

func TestEndpointFromEnvPrefersConfigured(t *testing.T) {
	t.Setenv("HELIUS_RPC_URL", "https://configured.example/?api-key=x")
	if got := EndpointFromEnv("https://fallback.example"); got != "https://configured.example/?api-key=x" {
		t.Errorf("got %s", got)
	}
	t.Setenv("HELIUS_RPC_URL", "   ")
	t.Setenv("SOLANA_RPC_URL", "")
	if got := EndpointFromEnv("https://fallback.example"); got != "https://fallback.example" {
		t.Errorf("a blank variable must not win over the fallback, got %s", got)
	}
}
