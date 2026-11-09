package growth

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/BeyndtechArc/Seametry/server/internal/identity"
)

func TestThePeopleListFiltersSearchesLiterallyAndPagesThroughEveryone(t *testing.T) {
	_, _, pool := fresh(t)
	ctx := context.Background()
	people := NewPeople(pool)
	importFake(t, people, fakeLedger(t))
	if err := people.Join(ctx, identity.Subject{AccountID: "acct-1", Wallets: []string{holder}}, at); err != nil {
		t.Fatal(err)
	}

	// Every imported lead shares one updated_at, so only the id tie-break
	// keeps the pages from repeating or skipping anyone.
	seen := map[[16]byte]bool{}
	var after *PersonCursor
	for pages := 0; ; pages++ {
		page, err := people.List(ctx, PeopleFilter{}, after, 2)
		if err != nil {
			t.Fatal(err)
		}
		if page.Total != 5 {
			t.Fatalf("total = %d, want the 4 imported and 1 signed up", page.Total)
		}
		for _, person := range page.People {
			if seen[person.ID] {
				t.Fatalf("%s appeared on two pages", person.DisplayName)
			}
			seen[person.ID] = true
		}
		if page.Next == nil {
			if pages != 2 || len(seen) != 5 {
				t.Fatalf("%d pages held %d people, want 3 pages holding all 5", pages+1, len(seen))
			}
			if len(page.Stages) != 1 || page.Stages[0] != (StageCount{Stage: "lead", People: 5}) {
				t.Fatalf("stages = %+v, want everyone a lead", page.Stages)
			}
			break
		}
		after = page.Next
	}

	signedUp, err := people.List(ctx, PeopleFilter{CreatedFrom: "signup"}, nil, 50)
	if err != nil {
		t.Fatal(err)
	}
	if signedUp.Total != 1 || !signedUp.People[0].Verified || signedUp.People[0].Wallets != 1 || signedUp.People[0].ImportedScore != nil {
		t.Fatalf("signed up = %+v, want one person, proved, with one wallet and no ledger score", signedUp.People)
	}

	byHandle, err := people.List(ctx, PeopleFilter{Search: "FAKEONE", Tier: "P3"}, nil, 50)
	if err != nil {
		t.Fatal(err)
	}
	if byHandle.Total != 2 || byHandle.People[0].XHandle != "fakeone" || byHandle.People[0].Verified {
		t.Fatalf("searching a handle without case = %+v, want the two leads holding @fakeone, unproved", byHandle.People)
	}
	for _, literal := range []string{"%", "_", `\`} {
		matched, err := people.List(ctx, PeopleFilter{Search: literal}, nil, 50)
		if err != nil {
			t.Fatal(err)
		}
		if matched.Total != 0 {
			t.Fatalf("searching %q matched %d people; it must be matched as itself, not as a wildcard", literal, matched.Total)
		}
	}

	for _, refused := range []PeopleFilter{{Stage: "champion"}, {OutreachStatus: "Sent"}, {CreatedFrom: "scrape"}, {Tier: "P0"}} {
		if _, err := people.List(ctx, refused, nil, 50); !errors.As(err, new(Refused)) {
			t.Fatalf("filter %+v = %v, want Refused", refused, err)
		}
	}
	if _, err := people.List(ctx, PeopleFilter{}, nil, MaxPeoplePage+1); !errors.As(err, new(Refused)) {
		t.Fatalf("a page over %d = %v, want Refused", MaxPeoplePage, err)
	}
}

func TestAPersonsTimelineIsWhatNamesThemAndWhatTheirProvedWalletsDid(t *testing.T) {
	events, report, pool := fresh(t)
	ctx := context.Background()
	people := NewPeople(pool)
	record(t, report, pool)
	if _, err := events.Project(ctx, report, at); err != nil {
		t.Fatal(err)
	}
	if err := people.Join(ctx, identity.Subject{AccountID: "acct-1", Wallets: []string{holder}}, at); err != nil {
		t.Fatal(err)
	}
	var id [16]byte
	if err := pool.QueryRow(ctx, "SELECT person_id FROM growth.identities WHERE kind = 'account' AND value = 'acct-1'").Scan(&id); err != nil {
		t.Fatal(err)
	}
	if err := people.SetStage(ctx, pgtype.UUID{Bytes: id, Valid: true}, "connected", "admin", at.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	// A wallet only a ledger claimed, with an event of its own: the record
	// lists the claim, and must not hand its activity to this person.
	if _, err := pool.Exec(ctx, `INSERT INTO growth.identities (person_id, kind, value, provenance, verified, first_seen_at, last_seen_at)
		VALUES ($1, 'wallet', $2, 'import', false, $3, $3)`, id, otherHolder, at); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO growth.events (type, wallet, properties, source, origin, origin_key, occurred_at)
		VALUES ('leg.landed', $1, '{}', 'chain', 'test', 'claimed-wallet', $2)`, otherHolder, at); err != nil {
		t.Fatal(err)
	}

	person, err := people.Read(ctx, id, at.Add(time.Hour), 50)
	if err != nil {
		t.Fatal(err)
	}
	if len(person.Timeline) == 0 {
		t.Fatal("the timeline is empty; the proved wallet's projected events should be there")
	}
	named := false
	for _, event := range person.Timeline {
		if event.Wallet == otherHolder {
			t.Fatalf("%s from a wallet only a ledger claimed reached this person's timeline", event.Type)
		}
		named = named || event.Type == "lead.stage_changed"
	}
	if !named {
		t.Fatalf("no event naming the person is on the timeline: %+v", person.Timeline)
	}
	for i := 1; i < len(person.Timeline); i++ {
		if person.Timeline[i].OccurredAt.After(person.Timeline[i-1].OccurredAt) {
			t.Fatal("the timeline is not newest first")
		}
	}
	proved := map[string]bool{}
	for _, held := range person.Identities {
		if held.Kind == "wallet" {
			proved[held.Value] = held.Verified
		}
	}
	if !proved[holder] || proved[otherHolder] || len(proved) != 2 || person.Summary.Wallets != 2 {
		t.Fatalf("wallet identities = %v, want %s proved and %s listed as only claimed", proved, holder, otherHolder)
	}
	if person.Imported != nil {
		t.Fatalf("a person who signed up carries ledger fields: %+v", person.Imported)
	}

	if _, err := people.Read(ctx, [16]byte{1}, at, 50); !errors.Is(err, ErrNoPerson) {
		t.Fatalf("an unknown id = %v, want ErrNoPerson", err)
	}
}

func TestHealthSaysWhereEachReaderLastMovedAndCountsAWeekOfEntries(t *testing.T) {
	events, report, pool := fresh(t)
	ctx := context.Background()
	people := NewPeople(pool)
	record(t, report, pool)
	if _, err := events.Project(ctx, report, at); err != nil {
		t.Fatal(err)
	}
	importFake(t, people, fakeLedger(t))
	visits := NewVisits(pool)
	for _, day := range []time.Time{at, at, at.AddDate(0, 0, -30)} {
		if err := visits.Count(ctx, day, "/", "x"); err != nil {
			t.Fatal(err)
		}
	}

	health, err := people.Health(ctx, at.AddDate(0, 0, -7))
	if err != nil {
		t.Fatal(err)
	}
	if len(health.Projections) != 1 || health.Projections[0].Origin != "execution.outbox" {
		t.Fatalf("projections = %+v, want the execution outbox", health.Projections)
	}
	if len(health.ChainReaders) != 0 {
		t.Fatalf("chain readers = %+v, want none before the Hall is read", health.ChainReaders)
	}
	sources := map[string]int64{}
	for _, source := range health.Sources {
		sources[source.Source] = source.Events
	}
	if sources["chain"] == 0 || sources["client"] == 0 || sources["server"] == 0 {
		t.Fatalf("events by source = %v, want the recorded leg's server, client and chain rows", sources)
	}
	if len(health.People) != 1 || health.People[0] != (OriginCount{CreatedFrom: "import", People: 4}) {
		t.Fatalf("people = %+v, want 4 imported", health.People)
	}
	if health.Entries != 2 || health.NewestEntryOn == nil || !health.NewestEntryOn.Equal(at.Truncate(24*time.Hour)) {
		t.Fatalf("entries %d newest %v, want the 2 within the week, newest on %s", health.Entries, health.NewestEntryOn, at.Format(time.DateOnly))
	}
}
