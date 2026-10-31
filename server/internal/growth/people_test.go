package growth

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/BeyndtechArc/Seametry/server/internal/identity"
)

const otherHolder = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh"

func fakeLead(id, handle, url string) map[string]any {
	return map[string]any{
		"id": id, "name": "Fake Person " + id, "org": "Frontier · Fake payments", "segment": "Payments", "handle": handle, "url": url,
		"channel": "X DM", "source": "Colosseum Frontier", "topics": "", "signalText": "", "angle": "", "fit": 10, "signal": 10, "reach": 5,
		"engagement": 0, "score": 25, "tier": "P3", "status": "Not contacted", "updatedAt": "", "added": "2026-10-29",
	}
}

func fakeFile(t *testing.T, leads ...map[string]any) []byte {
	t.Helper()
	raw, err := json.Marshal(map[string]any{"schema": "seametry.leads.v1", "exportedAt": "2026-10-29T10:00:00.000Z", "leads": leads})
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func fakeLedger(t *testing.T) Ledger {
	t.Helper()
	ledger, err := ParseLedger(fakeFile(t,
		fakeLead("lead-1", "@FakeOne", "https://colosseum.com/projects/fake"),
		// One project page names both, and the handle is shared too.
		fakeLead("lead-2", "@fakeone", "https://colosseum.com/projects/fake"),
		fakeLead("lead-3", "Abc1...9xyZ", "https://x.com/fake/status/1"),
		fakeLead("lead-4", "", ""),
	))
	if err != nil {
		t.Fatal(err)
	}
	return ledger
}

func count(t *testing.T, pool *pgxpool.Pool, query string, args ...any) int {
	t.Helper()
	var n int
	if err := pool.QueryRow(context.Background(), query, args...).Scan(&n); err != nil {
		t.Fatalf("%s: %v", query, err)
	}
	return n
}

func importFake(t *testing.T, people *People, ledger Ledger) ImportDiff {
	t.Helper()
	diff, err := people.Import(context.Background(), ledger, "legitimate_interest", "assessment of 2026-10-31", at)
	if err != nil {
		t.Fatalf("importing: %v", err)
	}
	return diff
}

func TestImportingALedgerTwiceWritesEachLeadOnce(t *testing.T) {
	_, _, pool := fresh(t)
	people, ledger := NewPeople(pool), fakeLedger(t)
	if first := importFake(t, people, ledger); len(first.New) != 4 {
		t.Fatalf("first import counted %d new, want 4", len(first.New))
	}
	second := importFake(t, people, ledger)
	if len(second.New) != 0 || len(second.Changed) != 0 || second.Unchanged != 4 {
		t.Errorf("second import diff %+v; want 4 unchanged and nothing else", second)
	}
	if got := count(t, pool, "SELECT count(*) FROM growth.people"); got != 4 {
		t.Errorf("%d people after importing 4 leads twice", got)
	}
	if got := count(t, pool, "SELECT count(*) FROM growth.events WHERE type = 'lead.imported' AND source = 'import' AND person_id IS NOT NULL"); got != 4 {
		t.Errorf("%d lead.imported events, want one per lead", got)
	}
}

func TestEveryImportedIdentityIsMarkedImportAndUnverified(t *testing.T) {
	_, _, pool := fresh(t)
	importFake(t, NewPeople(pool), fakeLedger(t))
	if got := count(t, pool, "SELECT count(*) FROM growth.identities WHERE provenance <> 'import' OR verified"); got != 0 {
		t.Errorf("%d identities not marked import", got)
	}
	want := map[string]int{"x": 2, "colosseum": 2, "unrecognised": 1, "web": 1}
	for kind, n := range want {
		if got := count(t, pool, "SELECT count(*) FROM growth.identities WHERE kind = $1", kind); got != n {
			t.Errorf("%d %s identities, want %d", got, kind, n)
		}
	}
	if got := count(t, pool, "SELECT count(*) FROM growth.identities WHERE kind = 'x' AND value = 'fakeone'"); got != 2 {
		t.Errorf("%d rows for a handle two leads share in different cases, want 2 under its one lowercase value", got)
	}
}

func TestDiffWritesNothing(t *testing.T) {
	_, _, pool := fresh(t)
	diff, err := NewPeople(pool).Diff(context.Background(), fakeLedger(t))
	if err != nil {
		t.Fatal(err)
	}
	if len(diff.New) != 4 || diff.SharedIdentities["x"] != 1 || diff.SharedIdentities["colosseum"] != 1 {
		t.Errorf("diff %+v; want 4 new, one shared handle and one shared page", diff)
	}
	if got := count(t, pool, "SELECT count(*) FROM growth.people"); got != 0 {
		t.Errorf("a diff wrote %d people", got)
	}
}

func TestAChangedLeadRefreshesTheFileAndKeepsWhatHappenedSince(t *testing.T) {
	_, _, pool := fresh(t)
	people := NewPeople(pool)
	ctx := context.Background()
	importFake(t, people, fakeLedger(t))
	if _, err := pool.Exec(ctx, "UPDATE growth.people SET outreach_status = 'replied', stage = 'visitor' WHERE import_key = 'lead-1'"); err != nil {
		t.Fatal(err)
	}
	changed := fakeLead("lead-1", "@FakeOne", "https://colosseum.com/projects/fake")
	changed["fit"] = 12
	ledger, err := ParseLedger(fakeFile(t, changed))
	if err != nil {
		t.Fatal(err)
	}
	diff := importFake(t, people, ledger)
	if len(diff.Changed) != 1 || diff.NotInFile != 3 {
		t.Errorf("diff %+v; want one changed and three held but not in the file", diff)
	}
	if got := count(t, pool, "SELECT count(*) FROM growth.people WHERE import_key = 'lead-1' AND imported_fit = 12 AND outreach_status = 'replied' AND stage = 'visitor'"); got != 1 {
		t.Error("a reimport did not refresh the file's fit while keeping the record's status and stage")
	}
}

func TestAnImportNeedsALawfulBasisStated(t *testing.T) {
	_, _, pool := fresh(t)
	people, ctx := NewPeople(pool), context.Background()
	if _, err := people.Import(ctx, fakeLedger(t), "", "note", at); err == nil || !strings.Contains(err.Error(), "lawful basis") {
		t.Errorf("no basis answered %v", err)
	}
	if _, err := people.Import(ctx, fakeLedger(t), "legitimate_interest", "  ", at); err == nil || !strings.Contains(err.Error(), "note") {
		t.Errorf("no note answered %v", err)
	}
	if got := count(t, pool, "SELECT count(*) FROM growth.people"); got != 0 {
		t.Errorf("a refused import wrote %d people", got)
	}
}

func TestALedgerTheRecordCannotHoldIsRefusedNamingOnlyTheLeadID(t *testing.T) {
	badStatus := fakeLead("lead-9", "@secret_handle", "")
	badStatus["status"] = "Ghosted"
	badTier := fakeLead("lead-9", "@secret_handle", "")
	badTier["tier"] = "Hot"
	extra := fakeLead("lead-9", "@secret_handle", "")
	extra["email"] = "fake@example.invalid"
	cases := map[string]struct {
		raw  []byte
		want string
	}{
		"status":  {fakeFile(t, badStatus), `"Ghosted"`},
		"tier":    {fakeFile(t, badTier), `"Hot"`},
		"field":   {fakeFile(t, extra), "email"},
		"repeat":  {fakeFile(t, fakeLead("lead-9", "", ""), fakeLead("lead-9", "", "")), "appears twice"},
		"schema":  {[]byte(`{"schema":"seametry.leads.v2","exportedAt":"2026-10-29T10:00:00.000Z","leads":[]}`), "seametry.leads.v2"},
		"nothing": {[]byte(`[]`), "does not decode"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := ParseLedger(c.raw)
			if err == nil || !strings.Contains(err.Error(), c.want) {
				t.Fatalf("answered %v; want a refusal naming %s", err, c.want)
			}
			if strings.Contains(err.Error(), "secret_handle") || strings.Contains(err.Error(), "Fake Person") {
				t.Errorf("the refusal leaks a person's details: %v", err)
			}
		})
	}
}

func TestRemovingAnImportTakesItsPeopleAndKeepsOneWhoSignedIn(t *testing.T) {
	_, _, pool := fresh(t)
	people, ctx := NewPeople(pool), context.Background()
	ledger := fakeLedger(t)
	importFake(t, people, ledger)
	if _, err := pool.Exec(ctx, `INSERT INTO growth.identities (person_id, kind, value, provenance, verified, first_seen_at, last_seen_at)
		SELECT id, 'account', 'acct-kept', 'account_token', true, now(), now() FROM growth.people WHERE import_key = 'lead-1'`); err != nil {
		t.Fatal(err)
	}
	removed, err := people.RemoveImport(ctx, ledger.Batch)
	if err != nil {
		t.Fatal(err)
	}
	if removed != 3 {
		t.Errorf("removed %d, want the 3 who never signed in", removed)
	}
	if got := count(t, pool, "SELECT count(*) FROM growth.events WHERE type = 'lead.imported'"); got != 1 {
		t.Errorf("%d lead.imported events remain, want the one kept person's", got)
	}
	if got := count(t, pool, "SELECT count(*) FROM growth.identities WHERE person_id NOT IN (SELECT id FROM growth.people)"); got != 0 {
		t.Errorf("%d identities outlived their person", got)
	}
}

func TestJoiningAnAccountRecordsOnlyWhatTheTokenProved(t *testing.T) {
	_, _, pool := fresh(t)
	people, ctx := NewPeople(pool), context.Background()
	subject := identity.Subject{AccountID: "acct-1", Wallets: []string{holder}, Email: "fake@example.invalid", EmailVerified: true}
	for range 2 {
		if err := people.Join(ctx, subject, at); err != nil {
			t.Fatalf("joining: %v", err)
		}
	}
	if got := count(t, pool, "SELECT count(*) FROM growth.people WHERE created_from = 'signup'"); got != 1 {
		t.Errorf("%d people after one account joined twice", got)
	}
	if got := count(t, pool, "SELECT count(*) FROM growth.identities WHERE kind = 'wallet' AND value = $1 AND provenance = 'signed_message' AND verified", holder); got != 1 {
		t.Error("the token's wallet is not recorded as signed for")
	}
	if got := count(t, pool, "SELECT count(*) FROM growth.identities WHERE value = 'fake@example.invalid'"); got != 0 {
		t.Error("the account's email was stored; nothing here may hold an address yet")
	}
}

func TestAWalletHeldByAnotherPersonStaysThereAndTheClashIsKept(t *testing.T) {
	_, _, pool := fresh(t)
	people, ctx := NewPeople(pool), context.Background()
	if err := people.Join(ctx, identity.Subject{AccountID: "acct-1", Wallets: []string{holder}}, at); err != nil {
		t.Fatal(err)
	}
	second := identity.Subject{AccountID: "acct-2", Wallets: []string{holder, otherHolder}}
	for range 2 {
		if err := people.Join(ctx, second, at); err != nil {
			t.Fatalf("a clash stopped the join: %v", err)
		}
	}
	if got := count(t, pool, "SELECT count(*) FROM growth.identities WHERE kind = 'wallet' AND value = $1", holder); got != 1 {
		t.Errorf("%d rows for one verified wallet", got)
	}
	if got := count(t, pool, "SELECT count(*) FROM growth.identities WHERE kind = 'wallet' AND value = $1", otherHolder); got != 1 {
		t.Error("the clash stopped the account's other wallet being recorded")
	}
	if got := count(t, pool, "SELECT count(*) FROM growth.events WHERE type = 'identity.conflict' AND wallet = $1", holder); got != 1 {
		t.Errorf("%d identity.conflict events, want one", got)
	}
}

func TestAStageChangeLogsItsEventAndAnUnknownStageIsRefused(t *testing.T) {
	_, _, pool := fresh(t)
	people, ctx := NewPeople(pool), context.Background()
	importFake(t, people, fakeLedger(t))
	var person pgtype.UUID
	if err := pool.QueryRow(ctx, "SELECT id FROM growth.people WHERE import_key = 'lead-1'").Scan(&person); err != nil {
		t.Fatal(err)
	}
	// A minute apart: at one instant the event's key would hide a second write.
	for _, when := range []time.Time{at, at.Add(time.Minute)} {
		if err := people.SetStage(ctx, person, "visitor", "server", when); err != nil {
			t.Fatal(err)
		}
	}
	var raw []byte
	if err := pool.QueryRow(ctx, "SELECT properties FROM growth.events WHERE type = 'lead.stage_changed' AND person_id = $1", person).Scan(&raw); err != nil {
		t.Fatalf("reading the one stage event: %v", err)
	}
	if want := `"from": "lead"`; !strings.Contains(string(raw), want) {
		t.Errorf("stage event %s; want it to carry %s", raw, want)
	}
	if got := count(t, pool, "SELECT count(*) FROM growth.events WHERE type = 'lead.stage_changed'"); got != 1 {
		t.Errorf("%d stage events from one real change", got)
	}
	if err := people.SetStage(ctx, person, "whale", "server", at); err == nil || !strings.Contains(err.Error(), fmt.Sprintf("%q", "whale")) {
		t.Errorf("an unknown stage answered %v", err)
	}
}
