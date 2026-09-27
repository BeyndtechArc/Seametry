package main

import (
	"os"
	"path/filepath"
	"strconv"
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

// writeHostConfig emits a vercel.json beside the generated files.
//
// The static output deploys as is, and this keeps the hosted headers identical
// to the ones served locally. Headers that differ between review and
// production are how a content security policy ends up enforced in exactly one
// of the two places it matters.
func writeHostConfig(out string) {
	var rules []string
	for _, h := range securityHeaders {
		rules = append(rules, `          { "key": `+strconv.Quote(h[0])+`, "value": `+strconv.Quote(h[1])+` }`)
	}

	config := `{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "cleanUrls": true,
  "trailingSlash": false,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
` + strings.Join(rules, ",\n") + `
      ]
    },
    {
      "source": "/fonts/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    },
    {
      "source": "/(.*).html",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }
      ]
    }
  ]
}
`
	if err := os.WriteFile(filepath.Join(out, "vercel.json"), []byte(config), 0o644); err != nil {
		fail(err)
	}
}
