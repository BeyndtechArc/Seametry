package main

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"strings"
	"time"
)

// serve hosts the generated Explorer over HTTP.
//
// Opening the files directly would mostly work, but not entirely: browsers
// refuse to load @font-face resources from a file:// origin, so the page would
// silently fall back to system faces and the typography being reviewed would
// not be the typography that ships. Serving also matches how it will actually
// be hosted, which is the point of testing it.
func serve(dir, addr string) {
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		fail(fmt.Errorf("listen on %s: %w", addr, err))
	}

	files := http.FileServer(http.Dir(dir))
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Every response is generated output, and a stale cached copy during
		// review is worse than a slow one.
		w.Header().Set("Cache-Control", "no-store")

		// The same headers the host will send, from one definition in host.go.
		for _, h := range securityHeaders {
			w.Header().Set(h[0], h[1])
		}

		// A bare name resolves to its page, so /instruments works like a URL
		// rather than only /instruments.html.
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path != "" && !strings.Contains(path, ".") {
			if _, err := os.Stat(dir + "/" + path + ".html"); err == nil {
				r.URL.Path = "/" + path + ".html"
			}
		}

		start := time.Now()
		files.ServeHTTP(w, r)
		fmt.Printf("  %-4s %-28s %s\n", r.Method, r.URL.Path, time.Since(start).Round(time.Microsecond))
	})

	url := "http://" + listener.Addr().String()
	fmt.Printf("\nserving %s at %s\n", dir, url)
	fmt.Printf("  %s/            the argument and what is built\n", url)
	fmt.Printf("  %s/instruments what each fixture actually is\n", url)
	fmt.Printf("  %s/evidence    the full survey\n", url)
	fmt.Printf("  %s/verify      check a hallmark in your own browser\n", url)
	fmt.Printf("\nctrl+c to stop\n\n")

	if err := http.Serve(listener, handler); err != nil {
		fail(err)
	}
}
