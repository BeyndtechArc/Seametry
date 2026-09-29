package store

import (
	"context"
	"database/sql"

	"github.com/jackc/pgx/v5/pgxpool"

	_ "github.com/jackc/pgx/v5/stdlib" // registers the "pgx" driver for database/sql, which goose's Provider requires
)

// Open opens a database/sql connection over pgx's stdlib adapter, for
// goose's Provider, which is written against database/sql
// (docs/prd/API.md section 12 step A1). It does not ping: a caller that
// needs to fail fast on an unreachable database calls db.PingContext
// itself, since only the caller knows how long it is willing to wait.
func Open(dsn string) (*sql.DB, error) {
	return sql.Open("pgx", dsn)
}

// OpenPool opens a native pgx pool, for the generated query code in
// server/internal/store/observationdb and its later siblings, whose DBTX
// interface is pgx's own, not database/sql's (docs/prd/API.md section 9.1:
// "pgx and sqlc"). It does not ping, for the same reason Open does not.
func OpenPool(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	return pgxpool.New(ctx, dsn)
}
