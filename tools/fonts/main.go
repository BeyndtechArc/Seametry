// Command fonts fetches Sentient and Switzer from Fontshare into assets/fonts.
//
// The font files are deliberately not committed. The ITF Free Font License
// permits self-hosting for our own sites and applications, and explicitly
// recommends it, but it forbids redistributing the font software "through
// another font website, font library, marketplace, repository, download
// service" or "publicly accessible servers". This repository is public, so
// committing the binaries would be redistribution. Anyone who needs them runs
// this and obtains their own copy directly from Fontshare, which is what the
// licence requires of them anyway.
//
// Subsetting and format conversion are also forbidden, so the variable WOFF2
// ships whole. That is 94KB for both faces across every weight, which is
// smaller than most subsetted static families would be.
//
// Usage:
//
//	go run ./tools/fonts
package main

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const fontshareDownload = "https://api.fontshare.com/v2/fonts/download/"

type family struct {
	slug string
	// want maps a suffix inside the archive to the name we write locally.
	// Web gets the variable WOFF2; mobile embedding gets the variable TTF.
	want map[string]string
}

var families = []family{
	{slug: "sentient", want: map[string]string{
		"/WEB/fonts/Sentient-Variable.woff2": "Sentient-Variable.woff2",
		"/TTF/Sentient-Variable.ttf":         "Sentient-Variable.ttf",
		"/License/FFL.txt":                   "FONTSHARE-FFL.txt",
	}},
	{slug: "switzer", want: map[string]string{
		"/WEB/fonts/Switzer-Variable.woff2": "Switzer-Variable.woff2",
		"/TTF/Switzer-Variable.ttf":         "Switzer-Variable.ttf",
	}},
}

func main() {
	dir := filepath.Join("assets", "fonts")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		fail(err)
	}

	client := &http.Client{Timeout: 120 * time.Second}
	total := 0
	for _, f := range families {
		fmt.Printf("fetching %s\n", f.slug)
		response, err := client.Get(fontshareDownload + f.slug)
		if err != nil {
			fail(fmt.Errorf("%s: %w", f.slug, err))
		}
		body, err := io.ReadAll(response.Body)
		response.Body.Close()
		if err != nil {
			fail(fmt.Errorf("%s: %w", f.slug, err))
		}
		if response.StatusCode != http.StatusOK {
			fail(fmt.Errorf("%s: HTTP %d", f.slug, response.StatusCode))
		}

		archive, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
		if err != nil {
			fail(fmt.Errorf("%s: %w", f.slug, err))
		}

		found := map[string]bool{}
		for _, entry := range archive.File {
			for suffix, local := range f.want {
				if !strings.HasSuffix(entry.Name, suffix) {
					continue
				}
				source, err := entry.Open()
				if err != nil {
					fail(err)
				}
				content, err := io.ReadAll(source)
				source.Close()
				if err != nil {
					fail(err)
				}
				path := filepath.Join(dir, local)
				if err := os.WriteFile(path, content, 0o644); err != nil {
					fail(err)
				}
				fmt.Printf("  %-28s %7d bytes\n", local, len(content))
				found[suffix] = true
				total += len(content)
			}
		}
		for suffix := range f.want {
			if !found[suffix] {
				fail(fmt.Errorf("%s: the archive no longer contains %s; Fontshare may have changed its layout", f.slug, suffix))
			}
		}
	}

	fmt.Printf("\n%d bytes written to %s\n", total, dir)
	fmt.Println("These files are gitignored on purpose. See the package comment, or assets/fonts/README.md.")
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "fonts:", err)
	os.Exit(1)
}
