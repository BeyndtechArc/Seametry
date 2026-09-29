// Package store holds what server/cmd/seametry needs to reach Postgres: a
// pool per role, and the migration runner that gives each schema its own
// role and its own migration history before any service reads from it.
//
// The outbox dispatcher and the object store interface (server/internal/
// gateway/server.go's doc comment, mirroring docs/prd/API.md section 10)
// are not built here yet; nothing in this repository needs them before a
// service has data to dispatch or a raw payload to store.
package store

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"

	"github.com/pressly/goose/v3"
	gooselock "github.com/pressly/goose/v3/lock"

	"github.com/BeyndtechArc/Seametry/server/migrations"
)

// Migrate applies one schema's migrations. The tracking table lives in
// public, qualified by schema name (public.goose_<schema>_migrations), never
// inside the schema it tracks: the schema does not exist yet when goose
// would otherwise need to create a tracking table inside it, and every
// database has a public schema to hold this one, deploy-time-only exception
// to "a service owns its tables" (ENGINEERING_STANDARD.md section 10). No
// running service queries this table; only this function does.
func Migrate(ctx context.Context, db *sql.DB, schema string) ([]*goose.MigrationResult, error) {
	sub, err := fs.Sub(migrations.FS, schema)
	if err != nil {
		return nil, fmt.Errorf("store: %s has no migrations directory: %w", schema, err)
	}
	// A session-level Postgres advisory lock, one shared lock ID across
	// every schema: two processes migrating the same database at once
	// (a live test run alongside another, or two deploys racing) serialize
	// here instead of both attempting the same CREATE TABLE.
	locker, err := gooselock.NewPostgresSessionLocker()
	if err != nil {
		return nil, fmt.Errorf("store: building the migration lock: %w", err)
	}
	provider, err := goose.NewProvider(goose.DialectPostgres, db, sub,
		goose.WithTableName(fmt.Sprintf("public.goose_%s_migrations", schema)),
		goose.WithSessionLocker(locker))
	if err != nil {
		return nil, fmt.Errorf("store: building the migration provider for %s: %w", schema, err)
	}
	results, err := provider.Up(ctx)
	if err != nil {
		return nil, fmt.Errorf("store: migrating %s: %w", schema, err)
	}
	return results, nil
}

// MigrateAll applies every schema in migrations.Schemas, in order.
func MigrateAll(ctx context.Context, db *sql.DB) error {
	for _, schema := range migrations.Schemas {
		if _, err := Migrate(ctx, db, schema); err != nil {
			return err
		}
	}
	return nil
}
