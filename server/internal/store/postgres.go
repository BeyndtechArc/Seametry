package store

import (
	"database/sql"

	_ "github.com/jackc/pgx/v5/stdlib" // registers the "pgx" driver for database/sql, which goose's Provider requires
)

// Open opens a database/sql connection over pgx's stdlib adapter. It does
// not ping: a caller that needs to fail fast on an unreachable database
// calls db.PingContext itself, since only the caller knows how long it is
// willing to wait.
func Open(dsn string) (*sql.DB, error) {
	return sql.Open("pgx", dsn)
}
