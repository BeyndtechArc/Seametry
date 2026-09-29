// Command seametry is the Gateway process: the one HTTP server behind every
// surface (docs/prd/API.md section 1). It has three subcommands.
//
//	seametry serve     runs the HTTP server (the default with no argument)
//	seametry migrate   applies every schema's goose migrations and exits
//	seametry replay    ingests the evidence already committed under
//	                   shared/fixtures and shared/evidence as the first raw
//	                   payloads and observations, then exits
//
// Usage:
//
//	go run ./server/cmd/seametry
//	go run ./server/cmd/seametry migrate
//	go run ./server/cmd/seametry replay
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/basket"
	"github.com/BeyndtechArc/Seametry/server/internal/gateway"
	"github.com/BeyndtechArc/Seametry/server/internal/solana"
	"github.com/BeyndtechArc/Seametry/server/internal/store"
	"github.com/BeyndtechArc/Seametry/server/internal/store/observationdb"
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
	case "replay":
		err = replay(".")
	default:
		err = fmt.Errorf("unknown command %q: usage is %q, %q or %q", cmd, "serve", "migrate", "replay")
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

	// Real from A3 on: ListInstruments, GetInstrument, GetInstrumentDepth
	// and GetInstrumentAdmissibility read what A2 persisted, so a process
	// that cannot reach Postgres cannot honestly answer /v1/status as
	// healthy while every one of those would fail. It fails to start
	// instead (ENGINEERING_STANDARD.md section 13: "failure is typed... a
	// service that cannot answer returns a typed degradation, never an
	// empty success" applies to boot, not only to one request).
	dsn := os.Getenv("SEAMETRY_DATABASE_URL")
	if dsn == "" {
		return errors.New("SEAMETRY_DATABASE_URL is not set; serve needs it to answer the real reads A3 built")
	}
	objectDir := os.Getenv("SEAMETRY_OBJECT_STORE_DIR")
	if objectDir == "" {
		objectDir = filepath.Join("server", "data", "objects")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	pool, err := store.OpenPool(ctx, dsn)
	cancel()
	if err != nil {
		return fmt.Errorf("opening SEAMETRY_DATABASE_URL: %w", err)
	}
	defer pool.Close()
	pingCtx, pingCancel := context.WithTimeout(context.Background(), 10*time.Second)
	err = pool.Ping(pingCtx)
	pingCancel()
	if err != nil {
		return fmt.Errorf("pinging SEAMETRY_DATABASE_URL: %w", err)
	}

	hallEndpoint := strings.TrimSpace(os.Getenv("SEAMETRY_HALL_DEVNET_RPC_URL"))
	if hallEndpoint == "" {
		hallEndpoint = "https://api.devnet.solana.com"
	}
	hall, err := solana.New(hallEndpoint, solana.Options{})
	if err != nil {
		return fmt.Errorf("configuring the devnet Hall reader: %w", err)
	}
	gwServer := gateway.NewServer(observationdb.New(pool), store.NewDirObjectStore(objectDir)).
		WithHall(hall, basket.HallDevnetProgramID, "devnet")
	handler := gateway.NewHandler(gwServer)
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
// run once per deploy by an operator or CI, not on every process boot: a
// fresh database needs its schemas before serve's own connection (which
// uses no elevated privilege) can do anything with them. Since A3, serve
// itself requires a reachable, already migrated database to start at all
// (see serve's own comment); migrate is what gets it into that state first.
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
