package main

import (
	"os"
	"path/filepath"
	"strings"
)

// securityHeaders is the single definition of what the Explorer sends. serve.go
// uses it locally and writeHostConfig emits it for the host, so reviewing the
// page locally reviews the policy that actually ships.
//
// connect-src 'none' is the interesting one. The page makes no network request
// after load, and putting that in the policy turns a claim into something the
// browser enforces. If verification ever started phoning home, this breaks it
// rather than hiding it.
var securityHeaders = [][2]string{
	{"Content-Security-Policy",
		"default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; " +
			"connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"},
	{"Referrer-Policy", "no-referrer"},
	{"X-Content-Type-Options", "nosniff"},
}

// writeHostConfig emits a Cloudflare Pages _headers file beside the generated
// files.
//
// The static output deploys as is, and this keeps the hosted headers identical
// to the ones served locally. Headers that differ between review and
// production are how a content security policy ends up enforced in exactly one
// of the two places it matters.
//
// No _redirects file is needed for clean URLs: Pages serves a matching HTML
// file for an extension-less path automatically ("If an HTML file is found
// with a matching path to the current route requested, Pages will serve it",
// per Cloudflare's serving-pages docs, checked 27 September 2026), so
// /evidence already serves evidence.html without configuration.
func writeHostConfig(out string) {
	var b strings.Builder
	b.WriteString("/*\n")
	for _, h := range securityHeaders {
		b.WriteString("  " + h[0] + ": " + h[1] + "\n")
	}
	b.WriteString("\n/fonts/*\n  Cache-Control: public, max-age=31536000, immutable\n")
	b.WriteString("\n/*.html\n  Cache-Control: public, max-age=0, must-revalidate\n")

	if err := os.WriteFile(filepath.Join(out, "_headers"), []byte(b.String()), 0o644); err != nil {
		fail(err)
	}
}
