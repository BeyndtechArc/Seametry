package solana

import (
	"net/url"
	"os"
	"strings"
)

// EndpointFromEnv returns the configured RPC endpoint, falling back to the
// public one.
//
// The public endpoint is fine for a handful of reads and unfit for anything on
// a cadence, where it is both slow and impolite to a shared resource.
func EndpointFromEnv(fallback string) string {
	for _, name := range []string{"HELIUS_RPC_URL", "SOLANA_RPC_URL"} {
		if v := strings.TrimSpace(os.Getenv(name)); v != "" {
			return v
		}
	}
	return fallback
}

// RedactEndpoint reduces a provider URL to scheme and host.
//
// Provider endpoints routinely carry the API key in the path or the query, so
// anything that records which cluster answered has to redact by construction
// rather than by the caller remembering. The host is enough to say which
// provider it was, and it is the part that is safe to publish.
//
// Every artifact this repository writes is committed, so this is the
// difference between an evidence file and a leaked credential.
func RedactEndpoint(endpoint string) string {
	parsed, err := url.Parse(strings.TrimSpace(endpoint))
	if err != nil || parsed.Host == "" {
		return "redacted"
	}
	return parsed.Scheme + "://" + parsed.Host + "/ (path and query redacted)"
}
