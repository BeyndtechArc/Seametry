package store_test

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"testing"

	"github.com/BeyndtechArc/Seametry/server/internal/store"
	"github.com/BeyndtechArc/Seametry/server/migrations"
)

// testPassword is not a secret: it authenticates nothing but a throwaway
// database a test creates and tears down, per SEAMETRY_TEST_DATABASE_URL
// (an admin connection to a local or CI-ephemeral Postgres, never a
// deployed one). docs/ENGINEERING_STANDARD.md section 19's "no secret is
// committed" is about credentials that unlock something real; this unlocks
// nothing outside this test's own connection.
const testPassword = "seametry_test_only"

// TestRoleCannotReadAnotherSchema is docs/prd/API.md section 12 step A1's
// own proof: "a role reading another schema is refused by Postgres."
func TestRoleCannotReadAnotherSchema(t *testing.T) {
	dsn := os.Getenv("SEAMETRY_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("SEAMETRY_TEST_DATABASE_URL is not set; this test needs a real Postgres 18 to prove a real boundary against")
	}
	ctx := context.Background()

	admin, err := store.Open(dsn)
	if err != nil {
		t.Fatalf("opening the admin connection: %v", err)
	}
	defer admin.Close()
	if err := admin.PingContext(ctx); err != nil {
		t.Fatalf("pinging Postgres at SEAMETRY_TEST_DATABASE_URL: %v", err)
	}

	if err := store.MigrateAll(ctx, admin); err != nil {
		t.Fatalf("applying every schema's migrations: %v", err)
	}

	// Any two schemas from the list prove the pattern; these are the first two
	// migrations.Schemas gives, so this test can never silently name a schema
	// that list no longer has.
	own, other := migrations.Schemas[0], migrations.Schemas[1]
	for _, role := range []string{own + "_role", other + "_role"} {
		if _, err := admin.ExecContext(ctx, fmt.Sprintf(`ALTER ROLE %s PASSWORD '%s'`, role, testPassword)); err != nil {
			t.Fatalf("setting a test password on %s: %v", role, err)
		}
	}

	scoped, err := connectAs(dsn, own+"_role")
	if err != nil {
		t.Fatalf("connecting as %s_role: %v", own, err)
	}
	defer scoped.Close()

	probe := own + ".boundary_probe"
	defer admin.ExecContext(ctx, "DROP TABLE IF EXISTS "+probe)

	if _, err := scoped.ExecContext(ctx, fmt.Sprintf("CREATE TABLE IF NOT EXISTS %s (id int)", probe)); err != nil {
		t.Fatalf("%s_role could not create a table in its own schema, which the grant should allow: %v", own, err)
	}

	otherProbe := other + ".boundary_probe"
	_, err = scoped.ExecContext(ctx, fmt.Sprintf("CREATE TABLE IF NOT EXISTS %s (id int)", otherProbe))
	if err == nil {
		admin.ExecContext(ctx, "DROP TABLE IF EXISTS "+otherProbe)
		t.Fatalf("%s_role created a table in %s's schema; REVOKE ALL ON SCHEMA %s FROM PUBLIC should have refused it", own, other, other)
	}
	t.Logf("%s_role was refused writing to %s's schema, as expected: %v", own, other, err)
}

// connectAs opens a connection as role, over the same host, port, database
// and sslmode as adminDSN, so the test proves the boundary over a real,
// separate, password-authenticated connection, the way a deployed service
// actually connects (docs/prd/API.md section 9.1: "each service connecting
// as a role"), not by SET ROLE inside the admin's own session.
func connectAs(adminDSN, role string) (*sql.DB, error) {
	u, err := url.Parse(adminDSN)
	if err != nil {
		return nil, fmt.Errorf("SEAMETRY_TEST_DATABASE_URL is not a URL: %w", err)
	}
	u.User = url.UserPassword(role, testPassword)
	return store.Open(u.String())
}
