package alert

import (
	"context"
	"strings"
	"testing"
)

// The wallet an opt-in carries is the browser's word: no signature proves
// the holder controls it, so it is kept marked unverified and the schema
// refuses a row that claims otherwise until a proof flow exists.
func TestAnOptInsWalletIsKeptAsUnverifiedMetadata(t *testing.T) {
	pool := freshPool(t)
	ctx := context.Background()
	if _, err := NewOptIns(pool).Keep(ctx, optIn()); err != nil {
		t.Fatal(err)
	}
	var verified bool
	var wallet string
	if err := pool.QueryRow(ctx, "SELECT wallet, wallet_verified FROM alert.email_optins").Scan(&wallet, &verified); err != nil {
		t.Fatalf("reading the kept wallet and its verification: %v", err)
	}
	if wallet != optIn().Wallet || verified {
		t.Fatalf("kept wallet %q verified %v, want %q kept unverified", wallet, verified, optIn().Wallet)
	}
	if _, err := pool.Exec(ctx, "UPDATE alert.email_optins SET wallet_verified = true"); err == nil {
		t.Fatal("a row was marked verified with no proof flow to say so")
	}
	var comment string
	if err := pool.QueryRow(ctx, "SELECT col_description('alert.email_optins'::regclass, attnum) FROM pg_attribute WHERE attrelid = 'alert.email_optins'::regclass AND attname = 'wallet'").Scan(&comment); err != nil || !strings.Contains(comment, "Unverified") {
		t.Fatalf("the wallet column's comment is %q (%v), want it to say the wallet is unverified", comment, err)
	}
}
