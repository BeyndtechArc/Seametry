// Package migrations embeds every schema's goose migration files, so the
// server ships as the one static binary docs/prd/API.md section 11 names,
// with no separate migrations directory to copy alongside it.
package migrations

import "embed"

//go:embed */*.sql
var FS embed.FS

// Schemas lists every schema in docs/prd/API.md section 9.1, in the order
// that table gives them. server/cmd/seametry's migrate command applies each
// in turn; server/internal/store's role-boundary test reads this same list
// so the two never name a different set of schemas.
var Schemas = []string{
	"registry",
	"observation",
	"market_state",
	"liquidity",
	"policy",
	"basket",
	"execution",
	"receipt",
	"alert",
	"identity",
	"gateway",
}
