// Command seametry is the Gateway process: the one HTTP server behind every
// surface (docs/prd/API.md section 1). It has two subcommands.
//
//	seametry serve    runs the HTTP server (the default with no argument)
//	seametry migrate   applies every schema's goose migrations and exits
//
// Usage:
//
//	go run ./server/cmd/seametry
//	go run ./server/cmd/seametry migrate
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/gateway"
	"github.com/BeyndtechArc/Seametry/server/internal/store"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	cmd := "serve"
	if len(os.Args) > 1 {
		cmd = os.Args[1]
	}

	var err error
	switch cmd {
	case "serve":
		err = serve()
	case "migrate":
		err = migrate()
	default:
		err = fmt.Errorf("unknown command %q: usage is %q or %q", cmd, "serve", "migrate")
	}
	if err != nil {
		slog.Error("seametry: exiting", "command", cmd, "error", err.Error())
		os.Exit(1)
	}
}

// port reads PORT from the environment, defaulting to 8080. It fails loudly
// on a value that is not a real port, rather than silently falling back.
func port() (string, error) {
	v := os.Getenv("PORT")
	if v == "" {
		return "8080", nil
	}
	if _, err := fmt.Sscanf(v, "%d", new(int)); err != nil {
		return "", fmt.Errorf("PORT=%q is not a number", v)
	}
	return v, nil
}

func serve() error {
	p, err := port()
	if err != nil {
		return err
	}

	handler := gateway.NewHandler(gateway.Server{})
	srv := &http.Server{
		Addr:              ":" + p,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	serveErr := make(chan error, 1)
	go func() {
		slog.Info("seametry: listening", "port", p)
		serveErr <- srv.ListenAndServe()
	}()

	select {
	case err := <-serveErr:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		slog.Info("seametry: shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			return fmt.Errorf("graceful shutdown: %w", err)
		}
	}
	return nil
}

// migrate applies every schema's migrations against SEAMETRY_DATABASE_URL,
// an admin connection: creating a schema and its role needs privileges no
// service's own scoped role has. It is a separate, explicit step from serve,
// run once per deploy by an operator or CI, not on every process boot, so a
// server that cannot yet reach a fresh database still starts and answers
// /v1/status (docs/prd/API.md section 12 step A1: "/v1/status answers in the
// envelope" is proven independently of the role-boundary proof).
func migrate() error {
	dsn := os.Getenv("SEAMETRY_DATABASE_URL")
	if dsn == "" {
		return errors.New("SEAMETRY_DATABASE_URL is not set; migrate needs an admin connection")
	}
	db, err := store.Open(dsn)
	if err != nil {
		return fmt.Errorf("opening SEAMETRY_DATABASE_URL: %w", err)
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		return fmt.Errorf("pinging SEAMETRY_DATABASE_URL: %w", err)
	}

	if err := store.MigrateAll(ctx, db); err != nil {
		return err
	}
	slog.Info("seametry: migrated every schema")
	return nil
}
