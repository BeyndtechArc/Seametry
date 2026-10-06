package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLayoutIncludesHouseMarkAndModeControl(t *testing.T) {
	data, err := templates.ReadFile("templates/layout.html")
	if err != nil {
		t.Fatalf("read layout template: %v", err)
	}
	for _, want := range [][]byte{
		[]byte(`<link rel="icon" href="{{.MarkAsset}}" type="image/svg+xml">`),
		[]byte(`<img class="house-mark" src="{{.MarkAsset}}" alt="">`),
		[]byte(`aria-label="Use dark mode"`),
		[]byte(`<script src="theme.js"></script>`),
	} {
		if !bytes.Contains(data, want) {
			t.Errorf("Explorer layout is missing %q", want)
		}
	}
}

func TestExplorerGroundDoesNotRepaintWithViewport(t *testing.T) {
	data, err := assets.ReadFile("assets/explorer.css")
	if err != nil {
		t.Fatalf("read Explorer stylesheet: %v", err)
	}
	css := string(data)
	start := strings.Index(css, "body::before {")
	if start < 0 {
		return
	}
	end := strings.Index(css[start:], "}\n")
	if end < 0 {
		t.Fatal("body::before has no closing brace")
	}
	ground := css[start : start+end]
	if strings.Contains(ground, "position: fixed") || strings.Contains(ground, "feTurbulence") {
		t.Fatal("Explorer ground uses a fixed SVG filter, which repaints while the visitor scrolls")
	}
}

// Cloudflare Pages limits, checked against the docs 27 September 2026: at most
// 100 header rules, 2,000 characters per line. Nothing enforces these at
// deploy time until the file is uploaded, so a rule added here without
// checking against them would only fail once it reached Cloudflare.
const (
	maxHeaderRules = 100
	maxLineChars   = 2000
)

// TestHostConfigIsCloudflareHeaders checks the emitted file is a _headers
// file, not the vercel.json it replaced, and that it stays inside Cloudflare
// Pages' documented limits.
func TestHostConfigIsCloudflareHeaders(t *testing.T) {
	dir := t.TempDir()
	writeHostConfig(dir)

	if _, err := os.Stat(filepath.Join(dir, "vercel.json")); err == nil {
		t.Fatal("writeHostConfig wrote vercel.json; the host moved to Cloudflare Pages, which reads _headers")
	}

	data, err := os.ReadFile(filepath.Join(dir, "_headers"))
	if err != nil {
		t.Fatalf("read _headers: %v", err)
	}

	lines := strings.Split(string(data), "\n")
	rules := 0
	for _, l := range lines {
		if len(l) > maxLineChars {
			t.Errorf("line exceeds Cloudflare's %d character limit (%d chars): %q", maxLineChars, len(l), l)
		}
		trimmed := strings.TrimSpace(l)
		if trimmed != "" && !strings.HasPrefix(l, " ") {
			rules++ // an un-indented, non-empty line is a URL pattern starting a new rule block
		}
	}
	if rules == 0 {
		t.Fatal("_headers has no rule blocks")
	}
	if rules > maxHeaderRules {
		t.Errorf("got %d header rules, Cloudflare Pages allows at most %d", rules, maxHeaderRules)
	}
}

// TestHostConfigCSPMatchesSecurityHeaders guards against host.go and
// securityHeaders drifting apart: the CSP served locally (serve.go, from
// securityHeaders directly) must be byte-identical to the CSP written for the
// host, since that identity is the whole point of the shared slice.
func TestHostConfigCSPMatchesSecurityHeaders(t *testing.T) {
	dir := t.TempDir()
	writeHostConfig(dir)

	data, err := os.ReadFile(filepath.Join(dir, "_headers"))
	if err != nil {
		t.Fatalf("read _headers: %v", err)
	}

	for _, h := range securityHeaders {
		want := "  " + h[0] + ": " + h[1]
		if !strings.Contains(string(data), want) {
			t.Errorf("_headers missing line for %s, want to find:\n%s\ngot:\n%s", h[0], want, data)
		}
	}
}
