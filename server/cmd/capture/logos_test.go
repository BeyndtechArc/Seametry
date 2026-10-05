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
	serve("/blank.json", "application/json", []byte(`{"name":"no image here"}`))

	cases := []struct {
		name        string
		uri         string
		hasMetadata bool
		want        LogoState
	}{
		{"a png named by the metadata is captured", server.URL + "/png.json", true, LogoCaptured},
		{"an svg is refused even when served as png", server.URL + "/svg.json", true, LogoUnsupported},
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
			if c.want == LogoCaptured && (entry.ContentType != "image/png" || entry.Bytes != len(png) || len(entry.SHA256) != 64) {
				t.Fatalf("captured entry is %+v", entry)
			}
			if c.want != LogoCaptured && entry.Reason == "" {
				t.Fatal("an uncaptured logo carries no reason")
			}
		})
	}
}
