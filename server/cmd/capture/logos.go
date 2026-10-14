package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"image"
	"image/color"
	_ "image/jpeg"
	"image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// A logo is the issuer's picture of its instrument, named by the URI the
// issuer wrote into the mint. It is mirrored, not linked, because the issuer
// can change or remove the file behind that URI at any time; the mirror is
// what the issuer served at a recorded moment, with its digest, and a later
// change on the issuer's side cannot change our pages.
//
// An SVG is a document that can carry script, and a mirrored one is served
// from Seametry's own origin, so one is kept only when every element and
// attribute in it is plain drawing (svgElements, svgAttributes) and every
// reference stays inside the file. Anything else is recorded as unsupported,
// naming what refused it. Backpack Securities serves every logo as SVG. The
// site's Content-Security-Policy also covers /instruments, so a script that
// got past this check would still not run.

// LogoState says what became of one fixture's logo. Every fixture gets an
// entry: a logo that could not be mirrored is recorded with the reason,
// never left out, so "no logo" is never confused with "never looked".
type LogoState string

const (
	LogoCaptured    LogoState = "captured"
	LogoNoMetadata  LogoState = "no_metadata"
	LogoNoImage     LogoState = "no_image"
	LogoUnreachable LogoState = "unreachable"
	LogoUnsupported LogoState = "unsupported"
)

// Logo is one manifest entry.
type Logo struct {
	Symbol      string    `json:"symbol"`
	Mint        string    `json:"mint"`
	State       LogoState `json:"state"`
	Reason      string    `json:"reason,omitempty"`
	MetadataURI string    `json:"metadata_uri,omitempty"`
	ImageURI    string    `json:"image_uri,omitempty"`
	ContentType string    `json:"content_type,omitempty"`
	// Bytes and SHA256 are of the file the issuer served, the evidence.
	Bytes  int    `json:"bytes,omitempty"`
	SHA256 string `json:"sha256,omitempty"`
	// StoredBytes and StoredSHA256 are of the reduced copy kept at Path, set
	// only when the issuer's raster was larger than the mirror keeps.
	StoredBytes  int    `json:"stored_bytes,omitempty"`
	StoredSHA256 string `json:"stored_sha256,omitempty"`
	Path         string `json:"path,omitempty"`
}

// LogoManifest is the whole record, written to shared/evidence.
type LogoManifest struct {
	Producer   string `json:"producer"`
	CapturedAt string `json:"captured_at"`
	Logos      []Logo `json:"logos"`
}

const (
	maxMetadataBytes = 64 << 10
	maxLogoBytes     = 512 << 10
)

// rasterTypes maps a leading byte signature to the type it proves and the
// extension the mirror is written with. The bytes decide, not the server's
// Content-Type header, which an issuer's CDN is free to get wrong.
var rasterTypes = []struct {
	magic       []byte
	contentType string
	extension   string
}{
	{[]byte("\x89PNG\r\n\x1a\n"), "image/png", ".png"},
	{[]byte("\xff\xd8\xff"), "image/jpeg", ".jpg"},
}

func sniffRaster(body []byte) (string, string, bool) {
	for _, candidate := range rasterTypes {
		if bytes.HasPrefix(body, candidate.magic) {
			return candidate.contentType, candidate.extension, true
		}
	}
	if len(body) >= 12 && string(body[0:4]) == "RIFF" && string(body[8:12]) == "WEBP" {
		return "image/webp", ".webp", true
	}
	return "", "", false
}

const svgNamespace = "http://www.w3.org/2000/svg"

var svgElements = setOf("svg", "g", "defs", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
	"linearGradient", "radialGradient", "stop", "clipPath", "title", "desc")

var svgAttributes = setOf("xmlns", "version", "width", "height", "viewBox", "id", "transform", "opacity",
	"d", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "points",
	"fill", "fill-rule", "fill-opacity", "clip-rule", "clip-path",
	"stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-opacity",
	"offset", "stop-color", "stop-opacity", "gradientUnits", "gradientTransform")

func setOf(names ...string) map[string]bool {
	set := make(map[string]bool, len(names))
	for _, name := range names {
		set[name] = true
	}
	return set
}

// plainSVG reports why an SVG cannot be mirrored, or "" when every element
// and attribute in it is plain drawing. A reference may only point inside the
// file (url(#id)); one to another document is refused like a script is.
func plainSVG(body []byte) string {
	decoder := xml.NewDecoder(bytes.NewReader(body))
	root := true
	for {
		token, err := decoder.Token()
		if err == io.EOF {
			if root {
				return "the document holds no <svg> element"
			}
			return ""
		}
		if err != nil {
			return "the SVG is not well formed XML: " + err.Error()
		}
		switch t := token.(type) {
		case xml.Directive:
			return "the SVG carries a <!" + strings.SplitN(string(t), " ", 2)[0] + "> directive"
		case xml.StartElement:
			if root && t.Name.Local != "svg" {
				return "the document's root is <" + t.Name.Local + ">, not <svg>"
			}
			root = false
			if (t.Name.Space != "" && t.Name.Space != svgNamespace) || !svgElements[t.Name.Local] {
				return "the SVG carries <" + t.Name.Local + ">, which the mirror does not keep"
			}
			for _, attribute := range t.Attr {
				// Some issuer artwork declares xmlns:x but never uses it. A
				// namespace declaration alone cannot draw or fetch anything;
				// any actual namespaced element or attribute is still checked
				// below and refused unless it is ordinary SVG drawing.
				if attribute.Name.Space == "xmlns" && attribute.Name.Local == "x" && t.Name.Local == "svg" && attribute.Value == "http://www.w3.org/1999/xlink" {
					continue
				}
				if attribute.Name.Space != "" || !svgAttributes[attribute.Name.Local] {
					return "the SVG's <" + t.Name.Local + "> carries the attribute " + qualified(attribute.Name) + ", which the mirror does not keep"
				}
				if value := strings.ToLower(attribute.Value); strings.Count(value, "url(") != strings.Count(value, "url(#") {
					return "the SVG's " + attribute.Name.Local + " points outside the file: " + attribute.Value
				}
			}
		}
	}
}

func qualified(name xml.Name) string {
	if name.Space == "" {
		return name.Local
	}
	return name.Space + ":" + name.Local
}

// sniffImage names the type of a logo the mirror can keep and the extension
// it is written with, or the reason it cannot be kept.
func sniffImage(body []byte) (contentType, extension, refusal string) {
	if contentType, extension, ok := sniffRaster(body); ok {
		return contentType, extension, ""
	}
	if !bytes.Contains(bytes.ToLower(body[:min(len(body), 1024)]), []byte("<svg")) {
		return "", "", "the image is not PNG, JPEG, WebP or SVG by its leading bytes"
	}
	if refusal := plainSVG(body); refusal != "" {
		return "", "", refusal
	}
	return "image/svg+xml", ".svg", ""
}

func fetchLimited(client *http.Client, uri string, limit int) ([]byte, error) {
	response, err := client.Get(uri)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d from %s", response.StatusCode, uri)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, int64(limit)+1))
	if err != nil {
		return nil, err
	}
	if len(body) > limit {
		return nil, fmt.Errorf("%s is larger than the %d byte limit", uri, limit)
	}
	return body, nil
}

// resolveLogo follows a mint's metadata URI to the image it names and
// returns the entry with the image bytes when one was captured.
// listingToken is the part of a listing entry (go run ./server/cmd/survey
// -listings) the mirror reads: the URI the issuer wrote into the mint.
type listingToken struct {
	Symbol          string `json:"symbol"`
	Mint            string `json:"mint"`
	MetadataURI     string `json:"metadata_uri"`
	MetadataProblem string `json:"metadata_problem"`
}

func resolveLogo(client *http.Client, token listingToken) (Logo, []byte) {
	entry := Logo{Symbol: token.Symbol, Mint: token.Mint}
	if token.MetadataURI == "" {
		entry.State, entry.Reason = LogoNoMetadata, "the mint carries no TokenMetadata URI"
		if token.MetadataProblem != "" {
			entry.Reason = token.MetadataProblem
		}
		return entry, nil
	}
	entry.MetadataURI = token.MetadataURI

	document, err := fetchLimited(client, token.MetadataURI, maxMetadataBytes)
	if err != nil {
		entry.State, entry.Reason = LogoUnreachable, "metadata: "+err.Error()
		return entry, nil
	}
	var named struct {
		Image string `json:"image"`
	}
	if err := json.Unmarshal(document, &named); err != nil {
		entry.State, entry.Reason = LogoUnsupported, "metadata is not JSON: "+err.Error()
		return entry, nil
	}
	if named.Image == "" {
		entry.State, entry.Reason = LogoNoImage, "the metadata names no image"
		return entry, nil
	}
	entry.ImageURI = named.Image

	image, err := fetchLimited(client, named.Image, maxLogoBytes)
	if err != nil {
		entry.State, entry.Reason = LogoUnreachable, "image: "+err.Error()
		return entry, nil
	}
	contentType, _, refusal := sniffImage(image)
	if refusal != "" {
		entry.State, entry.Reason = LogoUnsupported, refusal
		return entry, nil
	}
	sum := sha256.Sum256(image)
	entry.Bytes = len(image)
	entry.SHA256 = hex.EncodeToString(sum[:])
	stored, reduced, err := fitRaster(image)
	if err != nil {
		entry.State, entry.Reason = LogoUnsupported, "the raster did not decode: "+err.Error()
		return entry, nil
	}
	if reduced {
		storedSum := sha256.Sum256(stored)
		contentType = "image/png"
		entry.StoredBytes = len(stored)
		entry.StoredSHA256 = hex.EncodeToString(storedSum[:])
	}
	entry.State = LogoCaptured
	entry.ContentType = contentType
	return entry, stored
}

// maxLogoPixels is the widest raster the mirror keeps. The largest mark the
// interface draws is 56 CSS pixels, so 128 holds it sharp at twice the
// density. xStocks serves 400 pixel PNGs of about 25 KB each; kept whole,
// 1,451 of them measured 36 MB on 14 October 2026, more than the rest of
// the repository's history together.
const maxLogoPixels = 128

// fitRaster reduces a raster wider than maxLogoPixels by the smallest whole
// factor that fits, averaging each factor-by-factor block, and returns it as
// a PNG. Whole factors keep every output pixel an exact average of the
// issuer's, with no resampling filter to choose or explain. An SVG, or a
// raster already small enough, comes back unchanged.
func fitRaster(body []byte) ([]byte, bool, error) {
	if _, _, ok := sniffRaster(body); !ok {
		return body, false, nil
	}
	source, _, err := image.Decode(bytes.NewReader(body))
	if err != nil {
		if strings.Contains(err.Error(), "unknown format") {
			return body, false, nil
		}
		return nil, false, err
	}
	bounds := source.Bounds()
	if bounds.Dx() <= maxLogoPixels && bounds.Dy() <= maxLogoPixels {
		return body, false, nil
	}
	factor := (max(bounds.Dx(), bounds.Dy()) + maxLogoPixels - 1) / maxLogoPixels
	reduced := image.NewRGBA(image.Rect(0, 0, bounds.Dx()/factor, bounds.Dy()/factor))
	area := uint32(factor * factor)
	for y := 0; y < reduced.Bounds().Dy(); y++ {
		for x := 0; x < reduced.Bounds().Dx(); x++ {
			var r, g, b, a uint32
			for dy := 0; dy < factor; dy++ {
				for dx := 0; dx < factor; dx++ {
					pr, pg, pb, pa := source.At(bounds.Min.X+x*factor+dx, bounds.Min.Y+y*factor+dy).RGBA()
					r, g, b, a = r+pr, g+pg, b+pb, a+pa
				}
			}
			reduced.SetRGBA(x, y, color.RGBA{R: uint8(r / area >> 8), G: uint8(g / area >> 8), B: uint8(b / area >> 8), A: uint8(a / area >> 8)})
		}
	}
	var out bytes.Buffer
	if err := (&png.Encoder{CompressionLevel: png.BestCompression}).Encode(&out, reduced); err != nil {
		return nil, false, err
	}
	return out.Bytes(), true, nil
}

// mirrorWorkers bounds how many issuer requests run at once: enough that
// every listing (2,621 on 14 October 2026) finishes in minutes, few enough
// not to look like a flood.
const mirrorWorkers = 6

// mirrorLogos mirrors the logo of every listed instrument, from the metadata
// URI each mint carries, as recorded by the listing survey.
func mirrorLogos(listingDir, logoDir, manifestPath string) error {
	files, err := filepath.Glob(filepath.Join(listingDir, "*.json"))
	if err != nil {
		return err
	}
	var tokens []listingToken
	for _, path := range files {
		raw, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		var listed struct {
			Tokens []listingToken `json:"tokens"`
		}
		if err := json.Unmarshal(raw, &listed); err != nil {
			return fmt.Errorf("parse %s: %w", path, err)
		}
		tokens = append(tokens, listed.Tokens...)
	}
	if len(tokens) == 0 {
		return fmt.Errorf("no listed tokens under %s; run go run ./server/cmd/survey -listings first", listingDir)
	}
	if err := os.MkdirAll(logoDir, 0o755); err != nil {
		return fmt.Errorf("create %s: %w", logoDir, err)
	}
	client := &http.Client{Timeout: 20 * time.Second}
	manifest := LogoManifest{
		Producer:   "go run ./server/cmd/capture -logos",
		CapturedAt: time.Now().UTC().Format(time.RFC3339),
		Logos:      make([]Logo, len(tokens)),
	}

	work := make(chan int)
	failures := make(chan error, len(tokens))
	var done sync.WaitGroup
	for range mirrorWorkers {
		done.Add(1)
		go func() {
			defer done.Done()
			for index := range work {
				token := tokens[index]
				entry, image := resolveLogo(client, token)
				if image != nil {
					_, extension, _ := sniffImage(image)
					name := token.Mint + extension
					if err := os.WriteFile(filepath.Join(logoDir, name), image, 0o644); err != nil {
						failures <- fmt.Errorf("write %s logo: %w", token.Symbol, err)
						continue
					}
					entry.Path = "/instruments/" + name
				}
				manifest.Logos[index] = entry
			}
		}()
	}
	for index := range tokens {
		work <- index
	}
	close(work)
	done.Wait()
	close(failures)
	if err := <-failures; err != nil {
		return err
	}
	counts := map[LogoState]int{}
	for _, entry := range manifest.Logos {
		counts[entry.State]++
	}
	fmt.Printf("  %v\n", counts)

	// A logo the issuer withdrew must not outlive this run as a file the
	// manifest no longer vouches for.
	kept := map[string]bool{}
	for _, entry := range manifest.Logos {
		if entry.Path != "" {
			kept[filepath.Base(entry.Path)] = true
		}
	}
	existing, err := os.ReadDir(logoDir)
	if err != nil {
		return fmt.Errorf("read %s: %w", logoDir, err)
	}
	for _, file := range existing {
		if !file.IsDir() && !kept[file.Name()] {
			if err := os.Remove(filepath.Join(logoDir, file.Name())); err != nil {
				return fmt.Errorf("remove stale %s: %w", file.Name(), err)
			}
		}
	}

	sort.Slice(manifest.Logos, func(i, j int) bool { return manifest.Logos[i].Symbol < manifest.Logos[j].Symbol })
	body, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(manifestPath, append(body, '\n'), 0o644); err != nil {
		return fmt.Errorf("write %s: %w", manifestPath, err)
	}
	fmt.Printf("recorded %d logos in %s\n", len(manifest.Logos), manifestPath)
	return nil
}
