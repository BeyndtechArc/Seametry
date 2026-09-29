package gateway

import "net/http"

// CORS is docs/prd/API.md section 7's public-read rule: any origin, no
// credentials. Signed-in reads are not built yet (step A6); the credentialed
// case, restricted to the web client's own origin, is added there, not
// guessed at here.
func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key, Last-Event-ID")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
