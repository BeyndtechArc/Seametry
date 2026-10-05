package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/registry"
)

// A logo is the issuer's picture of its instrument, named by the URI the
// issuer wrote into the mint. It is mirrored, not linked, because the issuer
// can change or remove the file behind that URI at any time; the mirror is
// what the issuer served at a recorded moment, with its digest, and a later
// change on the issuer's side cannot change our pages.
//
// Only raster images are kept. An SVG is a document that can carry script,
// and this one would be served from Seametry's own origin, so it is recorded
// as unsupported rather than mirrored.

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
	Bytes       int       `json:"bytes,omitempty"`
	SHA256      string    `json:"sha256,omitempty"`
	Path        string    `json:"path,omitempty"`
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
func resolveLogo(client *http.Client, symbol, mint string, metadata registry.TokenMetadata, hasMetadata bool) (Logo, []byte) {
	entry := Logo{Symbol: symbol, Mint: mint}
	if !hasMetadata || metadata.URI == "" {
		entry.State, entry.Reason = LogoNoMetadata, "the mint carries no TokenMetadata URI"
		return entry, nil
	}
	entry.MetadataURI = metadata.URI

	document, err := fetchLimited(client, metadata.URI, maxMetadataBytes)
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
	contentType, _, ok := sniffRaster(image)
	if !ok {
		entry.State, entry.Reason = LogoUnsupported, "the image is not PNG, JPEG or WebP by its leading bytes"
		return entry, nil
	}
	sum := sha256.Sum256(image)
	entry.State = LogoCaptured
	entry.ContentType = contentType
	entry.Bytes = len(image)
	entry.SHA256 = hex.EncodeToString(sum[:])
	return entry, image
}

func mirrorLogos(fixtureDir, logoDir, manifestPath string) error {
	targets, err := loadTargets(filepath.Join(fixtureDir, "targets.json"))
	if err != nil {
		return err
	}
	if err := os.MkdirAll(logoDir, 0o755); err != nil {
		return fmt.Errorf("create %s: %w", logoDir, err)
	}
	client := &http.Client{Timeout: 20 * time.Second}
	manifest := LogoManifest{
		Producer:   "go run ./server/cmd/capture -logos",
		CapturedAt: time.Now().UTC().Format(time.RFC3339),
	}

	for _, target := range targets {
		raw, err := os.ReadFile(filepath.Join(fixtureDir, target.Symbol+".json"))
		if err != nil {
			return fmt.Errorf("%s is in targets.json but has no fixture; run go run ./server/cmd/capture first: %w", target.Symbol, err)
		}
		var fixture Fixture
		if err := json.Unmarshal(raw, &fixture); err != nil {
			return fmt.Errorf("parse %s fixture: %w", target.Symbol, err)
		}
		data, err := base64.StdEncoding.DecodeString(fixture.DataBase64)
		if err != nil {
			return fmt.Errorf("%s fixture data: %w", target.Symbol, err)
		}
		mint, err := registry.DecodeMint(data)
		if err != nil {
			return fmt.Errorf("decode %s: %w", target.Symbol, err)
		}
		metadata, hasMetadata, err := mint.TokenMetadata()
		if err != nil {
			return fmt.Errorf("%s metadata: %w", target.Symbol, err)
		}

		entry, image := resolveLogo(client, fixture.Symbol, fixture.Address, metadata, hasMetadata)
		if image != nil {
			_, extension, _ := sniffRaster(image)
			name := fixture.Address + extension
			if err := os.WriteFile(filepath.Join(logoDir, name), image, 0o644); err != nil {
				return fmt.Errorf("write %s logo: %w", target.Symbol, err)
			}
			entry.Path = "/instruments/" + name
		}
		fmt.Printf("  %-8s %-11s %s\n", entry.Symbol, entry.State, strings.TrimSpace(entry.Reason+" "+entry.Path))
		manifest.Logos = append(manifest.Logos, entry)
	}

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
