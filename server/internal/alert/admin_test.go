package alert

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestMaskAddressKeepsTooLittleToWriteTo(t *testing.T) {
	cases := map[string]string{
		"storm@gmail.com":         "s***@g***.com",
		"a@b.co":                  "a***@b***.co",
		"holder@mail.example.org": "h***@m***.org",
		"\u00e9lodie@example.com": "\u00e9***@e***.com",
		"nodomain@localhost":      "n***@***",
		"broken":                  "***",
		"@example.com":            "***",
	}
	for address, want := range cases {
		if got := MaskAddress(address); got != want {
			t.Errorf("MaskAddress(%q) = %q, want %q", address, got, want)
		}
	}
}

func TestSummaryCountsConsentsAndReturnsOnlyMaskedAddresses(t *testing.T) {
	pool := freshPool(t)
	ctx := context.Background()
	optIns := NewOptIns(pool)
	at := time.Date(2026, 10, 15, 9, 0, 0, 0, time.UTC)
	keep := func(address, ref, page, deployment string) string {
		t.Helper()
		optIns.now = func() time.Time { return at }
		at = at.Add(time.Hour)
		token, err := optIns.Keep(ctx, OptIn{Address: address, ConsentVersion: "2026-10-27", RefCode: ref, Page: page, Deployment: deployment})
		if err != nil {
			t.Fatal(err)
		}
		return token
	}
	keep("storm@gmail.com", "storm", "first_allocation", "production")
	withdrawn := keep("holder@example.com", "storm", "first_allocation", "production")
	keep("visitor@example.org", "", "feedback", "production")
	keep("tester@example.net", "", "feedback", "preview")
	if err := optIns.Withdraw(ctx, withdrawn); err != nil {
		t.Fatal(err)
	}

	summary, err := optIns.Summary(ctx, time.Date(2026, 10, 10, 0, 0, 0, 0, time.UTC), time.Date(2026, 10, 20, 0, 0, 0, 0, time.UTC), "production")
	if err != nil {
		t.Fatal(err)
	}
	wantCounts := []OptInCount{
		{Live: true, Page: "feedback", RefCode: "unknown", OptIns: 1},
		{Live: true, Page: "first_allocation", RefCode: "storm", OptIns: 1},
		{Live: false, Page: "first_allocation", RefCode: "storm", OptIns: 1},
	}
	if !reflect.DeepEqual(summary.Counts, wantCounts) {
		t.Fatalf("counts = %+v, want %+v", summary.Counts, wantCounts)
	}
	var addresses []string
	for _, recent := range summary.Recent {
		addresses = append(addresses, recent.Address)
		if strings.Contains(recent.Address, "gmail") || strings.Contains(recent.Address, "visitor") {
			t.Fatalf("a full address part left the consent record: %q", recent.Address)
		}
	}
	if want := []string{"v***@e***.org", "s***@g***.com"}; !reflect.DeepEqual(addresses, want) {
		t.Fatalf("recent = %v, want the two live production consents, newest first, masked: %v", addresses, want)
	}
}

func TestMailDeliveriesCountEachKindByWhetherItArrived(t *testing.T) {
	pool := freshPool(t)
	ctx := context.Background()
	delivered := &heldMail{}
	if err := NewNotices(pool, delivered).Settlements(ctx, []Settlement{{Wallet: holder, Symbol: "AMD", Signature: "sig-b", Outcome: "failed"}}); err != nil {
		t.Fatal(err)
	}
	refused := &heldMail{answer: errors.New("smtp: 554 refused")}
	if err := NewNotices(pool, refused).Settlements(ctx, []Settlement{{Wallet: holder, Symbol: "BE", Signature: "sig-c", Outcome: "dropped"}}); err != nil {
		t.Fatal(err)
	}

	counts, err := NewMail(pool).Deliveries(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(counts) != 2 {
		t.Fatalf("deliveries = %+v, want one delivered notice and one failed", counts)
	}
	byState := map[string]DeliveryCount{}
	for _, count := range counts {
		if count.Kind != "notices" || count.Mails != 1 {
			t.Fatalf("count = %+v, want one notice", count)
		}
		byState[count.Delivery] = count
	}
	if byState["delivered"].NewestDeliveredAt == nil || byState["failed"].NewestDeliveredAt != nil {
		t.Fatalf("delivered %+v failed %+v, want a delivery time only on the delivered one", byState["delivered"], byState["failed"])
	}
}
