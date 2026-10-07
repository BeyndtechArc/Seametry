package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/BeyndtechArc/Seametry/server/internal/registry"
)

func TestResolveLogoRecordsEveryOutcome(t *testing.T) {
	png := []byte("\x89PNG\r\n\x1a\nrest of a png")
	mux := http.NewServeMux()
	server := httptest.NewServer(mux)
	defer server.Close()
	serve := func(path, contentType string, body []byte) {
		mux.HandleFunc(path, func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", contentType)
			_, _ = w.Write(body)
		})
	}
	serve("/png.json", "application/json", []byte(`{"image":"`+server.URL+`/logo.png"}`))
	serve("/logo.png", "image/png", png)
	serve("/svg.json", "application/json", []byte(`{"image":"`+server.URL+`/logo.svg"}`))
	// Served as image/png on purpose: the bytes decide, not the header.
	serve("/logo.svg", "image/png", []byte(`<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>`))
	serve("/plain.json", "application/json", []byte(`{"image":"`+server.URL+`/plain.svg"}`))
	serve("/plain.svg", "image/svg+xml", []byte(plainLogo))
	serve("/blank.json", "application/json", []byte(`{"name":"no image here"}`))

	cases := []struct {
		name        string
		uri         string
		hasMetadata bool
		want        LogoState
	}{
		{"a png named by the metadata is captured", server.URL + "/png.json", true, LogoCaptured},
		{"an svg carrying script is refused even when served as png", server.URL + "/svg.json", true, LogoUnsupported},
		{"a plain drawing svg is captured", server.URL + "/plain.json", true, LogoCaptured},
		{"metadata naming no image is recorded", server.URL + "/blank.json", true, LogoNoImage},
		{"a missing metadata document is recorded", server.URL + "/gone.json", true, LogoUnreachable},
		{"a mint without metadata is recorded", "", false, LogoNoMetadata},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			entry, image := resolveLogo(server.Client(), "TESTx", "mint", registry.TokenMetadata{URI: c.uri}, c.hasMetadata)
			if entry.State != c.want {
				t.Fatalf("state %s (%s), want %s", entry.State, entry.Reason, c.want)
			}
			if (image != nil) != (c.want == LogoCaptured) {
				t.Fatalf("image returned %v for state %s", image != nil, entry.State)
			}
			if c.want == LogoCaptured && (entry.Bytes != len(image) || len(entry.SHA256) != 64) {
				t.Fatalf("captured entry is %+v", entry)
			}
			if c.want != LogoCaptured && entry.Reason == "" {
				t.Fatal("an uncaptured logo carries no reason")
			}
		})
	}
}

// The shape Backpack Securities serves its logos in, 7 October 2026: a
// comment, a gradient defined in the file and a path filled from it.
const plainLogo = `<!-- by TradingView --><svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="a" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#1A1A1A"/></linearGradient></defs><path d="M0 0h18v18H0z" fill="url(#a)"/></svg>`

func TestPlainSVGKeepsDrawingAndRefusesEverythingElse(t *testing.T) {
	if refusal := plainSVG([]byte(plainLogo)); refusal != "" {
		t.Fatalf("a plain logo was refused: %s", refusal)
	}
	refused := map[string]string{
		"script":              `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`,
		"event handler":       `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>`,
		"foreign object":      `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject/></svg>`,
		"style block":         `<svg xmlns="http://www.w3.org/2000/svg"><style>path{fill:red}</style></svg>`,
		"external fill":       `<svg xmlns="http://www.w3.org/2000/svg"><path fill="url(https://example.com/x#a)"/></svg>`,
		"one inside, one out": `<svg xmlns="http://www.w3.org/2000/svg"><path fill="url(#a) url(https://example.com/x)"/></svg>`,
		"xlink reference":     `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="https://example.com/x"/></svg>`,
		"doctype entity":      `<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg"></svg>`,
		"illustrator extra":   `<svg xmlns="http://www.w3.org/2000/svg"><metadata/></svg>`,
		"html root":           `<html><svg xmlns="http://www.w3.org/2000/svg"></svg></html>`,
	}
	for name, body := range refused {
		if plainSVG([]byte(body)) == "" {
			t.Errorf("%s was kept", name)
		}
	}
}
