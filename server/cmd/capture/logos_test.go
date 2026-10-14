package main

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestResolveLogoRecordsEveryOutcome(t *testing.T) {
	logo := pngOf(t, 10, 10, color.RGBA{A: 255})
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
	serve("/logo.png", "image/png", logo)
	serve("/svg.json", "application/json", []byte(`{"image":"`+server.URL+`/logo.svg"}`))
	// Served as image/png on purpose: the bytes decide, not the header.
	serve("/logo.svg", "image/png", []byte(`<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>`))
	serve("/plain.json", "application/json", []byte(`{"image":"`+server.URL+`/plain.svg"}`))
	serve("/plain.svg", "image/svg+xml", []byte(plainLogo))
	serve("/blank.json", "application/json", []byte(`{"name":"no image here"}`))

	cases := []struct {
		name    string
		uri     string
		problem string
		want    LogoState
	}{
		{"a png named by the metadata is captured", server.URL + "/png.json", "", LogoCaptured},
		{"an svg carrying script is refused even when served as png", server.URL + "/svg.json", "", LogoUnsupported},
		{"a plain drawing svg is captured", server.URL + "/plain.json", "", LogoCaptured},
		{"metadata naming no image is recorded", server.URL + "/blank.json", "", LogoNoImage},
		{"a missing metadata document is recorded", server.URL + "/gone.json", "", LogoUnreachable},
		{"a mint without metadata is recorded", "", "", LogoNoMetadata},
		{"a mint whose metadata did not decode keeps the survey's reason", "", "TokenMetadata undecodable: short", LogoNoMetadata},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			entry, image := resolveLogo(server.Client(), listingToken{Symbol: "TESTx", Mint: "mint", MetadataURI: c.uri, MetadataProblem: c.problem})
			if c.problem != "" && entry.Reason != c.problem {
				t.Fatalf("reason %q, want the survey's %q", entry.Reason, c.problem)
			}
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

func pngOf(t *testing.T, width, height int, fill color.RGBA) []byte {
	t.Helper()
	picture := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			picture.SetRGBA(x, y, fill)
		}
	}
	var out bytes.Buffer
	if err := png.Encode(&out, picture); err != nil {
		t.Fatal(err)
	}
	return out.Bytes()
}

// xStocks serves 400 pixel PNGs; the mirror keeps them at 100, a whole
// factor of four, and leaves anything already small enough byte for byte.
func TestFitRasterReducesByAWholeFactorAndKeepsSmallOnes(t *testing.T) {
	large := pngOf(t, 400, 400, color.RGBA{R: 200, G: 40, B: 10, A: 255})
	stored, reduced, err := fitRaster(large)
	if err != nil || !reduced {
		t.Fatalf("a 400 pixel logo came back reduced=%v err=%v", reduced, err)
	}
	picture, _, err := image.Decode(bytes.NewReader(stored))
	if err != nil {
		t.Fatal(err)
	}
	if picture.Bounds().Dx() != 100 || picture.Bounds().Dy() != 100 {
		t.Fatalf("stored at %v, want 100 by 100", picture.Bounds())
	}
	if r, g, b, a := picture.At(50, 50).RGBA(); r>>8 != 200 || g>>8 != 40 || b>>8 != 10 || a>>8 != 255 {
		t.Fatalf("a flat colour averaged to %d %d %d %d", r>>8, g>>8, b>>8, a>>8)
	}

	small := pngOf(t, 100, 100, color.RGBA{A: 255})
	if kept, reduced, err := fitRaster(small); err != nil || reduced || !bytes.Equal(kept, small) {
		t.Fatalf("a 100 pixel logo was changed: reduced=%v err=%v", reduced, err)
	}
	if kept, reduced, err := fitRaster([]byte(plainLogo)); err != nil || reduced || string(kept) != plainLogo {
		t.Fatalf("an SVG was changed: reduced=%v err=%v", reduced, err)
	}
}

// The shape Backpack Securities serves its logos in, 7 October 2026: a
// comment, a gradient defined in the file and a path filled from it.
const plainLogo = `<!-- by TradingView --><svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="a" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#1A1A1A"/></linearGradient></defs><path d="M0 0h18v18H0z" fill="url(#a)"/></svg>`

func TestPlainSVGKeepsDrawingAndRefusesEverythingElse(t *testing.T) {
	if refusal := plainSVG([]byte(plainLogo)); refusal != "" {
		t.Fatalf("a plain logo was refused: %s", refusal)
	}
	// Backpack's INTC artwork declares an unused xmlns:x; the declaration
	// itself is not a resource request and must not suppress its logo.
	unusedNamespace := `<svg xmlns="http://www.w3.org/2000/svg" xmlns:x="http://www.w3.org/1999/xlink"><path d="M0 0h18v18H0z" fill="#fff"/></svg>`
	if refusal := plainSVG([]byte(unusedNamespace)); refusal != "" {
		t.Fatalf("plain SVG with unused xmlns:x declaration was refused: %s", refusal)
	}
	refused := map[string]string{
		"script":              `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`,
		"event handler":       `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>`,
		"foreign object":      `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject/></svg>`,
		"style block":         `<svg xmlns="http://www.w3.org/2000/svg"><style>path{fill:red}</style></svg>`,
		"external fill":       `<svg xmlns="http://www.w3.org/2000/svg"><path fill="url(https://example.com/x#a)"/></svg>`,
		"one inside, one out": `<svg xmlns="http://www.w3.org/2000/svg"><path fill="url(#a) url(https://example.com/x)"/></svg>`,
		"xlink reference":     `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="https://example.com/x"/></svg>`,
		"x namespaced attr":   `<svg xmlns="http://www.w3.org/2000/svg" xmlns:x="http://www.w3.org/1999/xlink"><path d="M0 0" x:href="https://example.com/evil"/></svg>`,
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
