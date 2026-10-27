package alert

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func optIn() OptIn {
	return OptIn{Address: "holder@example.com", ConsentVersion: "2026-10-27", RefCode: "x", Wallet: "FFyrQgpU4BQ2FLesy6t5MmPUDimPj2ghwChTMrLBN5DM", Page: "first_allocation", Deployment: "production"}
}

func TestAnOptInIsKeptWithItsConsentAndOneLiveRowPerAddress(t *testing.T) {
	pool := freshPool(t)
	ctx := context.Background()
	optIns := NewOptIns(pool)
	first, err := optIns.Keep(ctx, optIn())
	if err != nil {
		t.Fatal(err)
	}
	again := optIn()
	again.Address, again.RefCode, again.Wallet = "Holder@Example.com", "", ""
	second, err := optIns.Keep(ctx, again)
	if err != nil {
		t.Fatal(err)
	}
	if first == second || len(second) < 32 {
		t.Fatalf("consenting again must issue a new token: first %q, second %q", first, second)
	}
	var rows int
	var refCode, wallet, consent string
	if err := pool.QueryRow(ctx, "SELECT count(*), max(ref_code), max(wallet), max(consent_version) FROM alert.email_optins").Scan(&rows, &refCode, &wallet, &consent); err != nil {
		t.Fatal(err)
	}
	if rows != 1 || refCode != "x" || wallet == "" || consent != "2026-10-27" {
		t.Fatalf("got %d rows, ref %q, wallet %q, consent %q; want one row keeping the first ref code and wallet", rows, refCode, wallet, consent)
	}
	if err := optIns.Withdraw(ctx, first); !errors.Is(err, ErrUnknownToken) {
		t.Fatalf("the replaced token: got %v, want ErrUnknownToken", err)
	}
}

func TestWithdrawingErasesTheAddressAndTheLinkWorksOnce(t *testing.T) {
	pool := freshPool(t)
	ctx := context.Background()
	optIns := NewOptIns(pool)
	token, err := optIns.Keep(ctx, optIn())
	if err != nil {
		t.Fatal(err)
	}
	if err := optIns.Withdraw(ctx, token); err != nil {
		t.Fatal(err)
	}
	var kept int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM alert.email_optins WHERE address IS NOT NULL OR wallet IS NOT NULL OR unsubscribe_token IS NOT NULL OR unsubscribed_at IS NULL").Scan(&kept); err != nil {
		t.Fatal(err)
	}
	if kept != 0 {
		t.Fatalf("%d rows still name someone after withdrawal", kept)
	}
	if err := optIns.Withdraw(ctx, token); !errors.Is(err, ErrUnknownToken) {
		t.Fatalf("a used link: got %v, want ErrUnknownToken", err)
	}
	if _, err := optIns.Keep(ctx, optIn()); err != nil {
		t.Fatalf("consenting again after withdrawing: %v", err)
	}
}

func TestAnOptInIsRefusedNamingWhatIsWrong(t *testing.T) {
	optIns := NewOptIns(nil)
	cases := map[string]func(*OptIn){
		"address":         func(o *OptIn) { o.Address = "Holder <holder@example.com>" },
		"consent_version": func(o *OptIn) { o.ConsentVersion = "" },
		"ref_code":        func(o *OptIn) { o.RefCode = "Not A Code" },
		"wallet":          func(o *OptIn) { o.Wallet = "not-a-wallet" },
		"page":            func(o *OptIn) { o.Page = "landing" },
		"deployment":      func(o *OptIn) { o.Deployment = "staging" },
	}
	for field, change := range cases {
		candidate := optIn()
		change(&candidate)
		var invalid Invalid
		if _, err := optIns.Keep(context.Background(), candidate); !errors.As(err, &invalid) || !strings.HasPrefix(invalid.Reason, field) {
			t.Errorf("%s: got %v, want Invalid naming %s", field, err, field)
		}
	}
}

func TestARefusedAddressIsNamedByFieldAndCodeNeverRepeated(t *testing.T) {
	optIns := NewOptIns(nil)
	for _, address := range []string{"Holder <holder.private@example.com>", "holder.private@example.com\r\nBcc: x@y.z", strings.Repeat("h", 250) + "@example.com"} {
		candidate := optIn()
		candidate.Address = address
		_, err := optIns.Keep(context.Background(), candidate)
		var invalid Invalid
		if !errors.As(err, &invalid) || invalid.Field != "address" || invalid.Code != "malformed" {
			t.Fatalf("got %#v, want Invalid with field address and code malformed", err)
		}
		if strings.Contains(err.Error(), "holder.private") || strings.Contains(err.Error(), "hhhh") {
			t.Fatalf("the refusal repeats the address: %q", err.Error())
		}
	}
}
