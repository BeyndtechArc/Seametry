package growth

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/BeyndtechArc/Seametry/server/internal/store/growthdb"
)

// The Admin's reads of Growth (docs/prd/ADMIN.md, People, Person and
// System). They only read: every change to a person goes through the
// methods in people.go and ledger.go, which log what they did.

// Refused is a read asked for in a shape Growth does not answer. Reason
// names the field and what it accepts.
type Refused struct{ Reason string }

func (r Refused) Error() string { return "growth: " + r.Reason }

// ErrNoPerson answers a person id the record does not hold.
var ErrNoPerson = errors.New("growth: no person has this id")

// MaxPeoplePage and MaxPersonTimeline bound one read.
const (
	MaxPeoplePage     = 200
	MaxPersonTimeline = 200
)

var origins = map[string]bool{"signup": true, "import": true}

// outreachCodes are the record's names for the ledger's statuses, so the
// two cannot name different sets.
var outreachCodes = func() map[string]bool {
	codes := make(map[string]bool, len(outreachStatuses))
	for _, code := range outreachStatuses {
		codes[code] = true
	}
	return codes
}()

// PeopleFilter narrows the people list. An empty field does not filter.
// Search matches the name or any identity's value, anywhere and without
// case; its % and _ are taken literally.
type PeopleFilter struct {
	Stage, OutreachStatus, CreatedFrom, Tier, Search string
}

func (f PeopleFilter) check() error {
	switch {
	case f.Stage != "" && !stages[f.Stage]:
		return Refused{fmt.Sprintf("stage %q is not one of lead, visitor, connected, preflighted, allocated, repeat, ap or advocate", f.Stage)}
	case f.OutreachStatus != "" && !outreachCodes[f.OutreachStatus]:
		return Refused{fmt.Sprintf("outreach status %q is not one of not_contacted, sent, replied, call_booked, testing, customer or pass", f.OutreachStatus)}
	case f.CreatedFrom != "" && !origins[f.CreatedFrom]:
		return Refused{fmt.Sprintf("origin %q is not signup or import", f.CreatedFrom)}
	case f.Tier != "" && !tierShape.MatchString(f.Tier):
		return Refused{fmt.Sprintf("tier %q is not a ledger tier, P1 to P9", f.Tier)}
	case len(f.Search) > 200:
		return Refused{fmt.Sprintf("a search of %d characters was asked for; at most 200 are matched", len(f.Search))}
	}
	return nil
}

func (f PeopleFilter) pattern() pgtype.Text {
	search := strings.TrimSpace(f.Search)
	if search == "" {
		return pgtype.Text{}
	}
	escaped := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(search)
	return pgtype.Text{String: "%" + escaped + "%", Valid: true}
}

// PersonCursor is the last row of a people page: the list resumes after it.
type PersonCursor struct {
	UpdatedAt time.Time
	ID        [16]byte
}

// PersonSummary is one row of the people list.
type PersonSummary struct {
	ID             [16]byte
	Kind           string
	DisplayName    string
	Stage          string
	OutreachStatus string
	CreatedFrom    string
	// ImportedTier and ImportedScore are the ledger's word, empty and nil
	// for a person who signed up.
	ImportedTier  string
	ImportedScore *int32
	XHandle       string
	Wallets       int64
	// Verified says an identity of this person was proved by a token or a
	// signature, not only claimed by a ledger.
	Verified  bool
	CreatedAt time.Time
	UpdatedAt time.Time
}

// StageCount is everyone at one stage, unfiltered.
type StageCount struct {
	Stage  string
	People int64
}

type PeoplePage struct {
	People []PersonSummary
	// Total is how many people the filter matches across every page.
	Total  int64
	Next   *PersonCursor
	Stages []StageCount
}

func optionalInt(value pgtype.Int4) *int32 {
	if !value.Valid {
		return nil
	}
	return &value.Int32
}

// List answers one page of people, newest change first.
func (p *People) List(ctx context.Context, filter PeopleFilter, after *PersonCursor, limit int) (PeoplePage, error) {
	if limit < 1 || limit > MaxPeoplePage {
		return PeoplePage{}, Refused{fmt.Sprintf("a page of %d people is not between 1 and %d", limit, MaxPeoplePage)}
	}
	if err := filter.check(); err != nil {
		return PeoplePage{}, err
	}
	params := growthdb.AdminPeopleParams{
		Stage: optionalText(filter.Stage), OutreachStatus: optionalText(filter.OutreachStatus), CreatedFrom: optionalText(filter.CreatedFrom),
		Tier: optionalText(filter.Tier), Pattern: filter.pattern(), RowLimit: int32(limit + 1),
	}
	if after != nil {
		params.AfterUpdated = timestamp(after.UpdatedAt)
		params.AfterID = pgtype.UUID{Bytes: after.ID, Valid: true}
	}
	rows, err := p.q.AdminPeople(ctx, params)
	if err != nil {
		return PeoplePage{}, fmt.Errorf("growth: reading a page of people: %w", err)
	}
	total, err := p.q.AdminPeopleTotal(ctx, growthdb.AdminPeopleTotalParams{
		Stage: params.Stage, OutreachStatus: params.OutreachStatus, CreatedFrom: params.CreatedFrom, Tier: params.Tier, Pattern: params.Pattern,
	})
	if err != nil {
		return PeoplePage{}, fmt.Errorf("growth: counting the people a filter matches: %w", err)
	}
	stageRows, err := p.q.AdminStageCounts(ctx)
	if err != nil {
		return PeoplePage{}, fmt.Errorf("growth: counting people by stage: %w", err)
	}
	page := PeoplePage{Total: total, People: make([]PersonSummary, 0, min(len(rows), limit)), Stages: make([]StageCount, len(stageRows))}
	for i, row := range stageRows {
		page.Stages[i] = StageCount{Stage: row.Stage, People: row.People}
	}
	for i, row := range rows {
		// One row past the page was read only to say whether another page follows.
		if i == limit {
			last := page.People[limit-1]
			page.Next = &PersonCursor{UpdatedAt: last.UpdatedAt, ID: last.ID}
			break
		}
		page.People = append(page.People, PersonSummary{
			ID: row.ID.Bytes, Kind: row.Kind, DisplayName: row.DisplayName, Stage: row.Stage, OutreachStatus: row.OutreachStatus,
			CreatedFrom: row.CreatedFrom, ImportedTier: row.ImportedTier.String, ImportedScore: optionalInt(row.ImportedScore),
			XHandle: row.XHandle, Wallets: row.Wallets, Verified: row.Verified,
			CreatedAt: row.CreatedAt.Time.UTC(), UpdatedAt: row.UpdatedAt.Time.UTC(),
		})
	}
	return page, nil
}

// Identity is one way the record knows a person, with whose word it is.
type Identity struct {
	Kind, Value, Provenance string
	Verified                bool
	FirstSeenAt, LastSeenAt time.Time
}

// Imported is what a lead ledger said of a person, kept as the ledger's
// word: its scores are the ledger's, not this record's measurement.
type Imported struct {
	Batch, LawfulBasis, LawfulBasisNote, Tier string
	Fit, Signal, Reach, Engagement, Score     *int32
	Detail                                    []byte
}

// Person is everything the record holds of one person.
type Person struct {
	Summary    PersonSummary
	Imported   *Imported
	Identities []Identity
	// Timeline is newest first: events naming the person and events of the
	// wallets they proved.
	Timeline []Event
}

// Read answers one person, with their timeline before a time.
func (p *People) Read(ctx context.Context, id [16]byte, before time.Time, limit int) (Person, error) {
	if limit < 1 || limit > MaxPersonTimeline {
		return Person{}, Refused{fmt.Sprintf("a timeline of %d events is not between 1 and %d", limit, MaxPersonTimeline)}
	}
	key := pgtype.UUID{Bytes: id, Valid: true}
	row, err := p.q.AdminPerson(ctx, key)
	if errors.Is(err, pgx.ErrNoRows) {
		return Person{}, ErrNoPerson
	}
	if err != nil {
		return Person{}, fmt.Errorf("growth: reading person %s: %w", key, err)
	}
	identities, err := p.q.AdminPersonIdentities(ctx, key)
	if err != nil {
		return Person{}, fmt.Errorf("growth: reading the identities of person %s: %w", key, err)
	}
	events, err := p.q.AdminPersonTimeline(ctx, growthdb.AdminPersonTimelineParams{PersonID: key, Before: timestamp(before), RowLimit: int32(limit)})
	if err != nil {
		return Person{}, fmt.Errorf("growth: reading the timeline of person %s: %w", key, err)
	}
	person := Person{
		Summary: PersonSummary{
			ID: row.ID.Bytes, Kind: row.Kind, DisplayName: row.DisplayName, Stage: row.Stage, OutreachStatus: row.OutreachStatus,
			CreatedFrom: row.CreatedFrom, ImportedTier: row.ImportedTier.String, ImportedScore: optionalInt(row.ImportedScore),
			CreatedAt: row.CreatedAt.Time.UTC(), UpdatedAt: row.UpdatedAt.Time.UTC(),
		},
		Identities: make([]Identity, len(identities)),
		Timeline:   make([]Event, len(events)),
	}
	if row.CreatedFrom == "import" {
		person.Imported = &Imported{
			Batch: row.ImportBatch.String, LawfulBasis: row.LawfulBasis.String, LawfulBasisNote: row.LawfulBasisNote.String, Tier: row.ImportedTier.String,
			Fit: optionalInt(row.ImportedFit), Signal: optionalInt(row.ImportedSignal), Reach: optionalInt(row.ImportedReach),
			Engagement: optionalInt(row.ImportedEngagement), Score: optionalInt(row.ImportedScore), Detail: row.ImportDetail,
		}
	}
	for i, identity := range identities {
		person.Identities[i] = Identity{
			Kind: identity.Kind, Value: identity.Value, Provenance: identity.Provenance, Verified: identity.Verified,
			FirstSeenAt: identity.FirstSeenAt.Time.UTC(), LastSeenAt: identity.LastSeenAt.Time.UTC(),
		}
		switch {
		case identity.Kind == "x" && person.Summary.XHandle == "":
			person.Summary.XHandle = identity.Value
		case identity.Kind == "wallet":
			person.Summary.Wallets++
		}
		person.Summary.Verified = person.Summary.Verified || identity.Verified
	}
	for i, event := range events {
		person.Timeline[i] = Event{
			ID: event.ID, Type: event.Type, Wallet: event.Wallet.String, Properties: event.Properties, Source: event.Source,
			Deployment: event.Deployment.String, Origin: event.Origin, OccurredAt: event.OccurredAt.Time.UTC(),
		}
	}
	return person, nil
}

// CursorAge is where one projection or chain reader last moved.
type CursorAge struct {
	Origin     string
	AdvancedAt time.Time
	// LastSlot is the chain slot a program reader has read to; 0 for an
	// outbox projection, which has no slot.
	LastSlot int64
}

// SourceCount is the timeline's events by whose word they are.
type SourceCount struct {
	Source                             string
	Events                             int64
	NewestOccurredAt, NewestReceivedAt time.Time
}

type OriginCount struct {
	CreatedFrom string
	People      int64
}

// Health is whether Growth is still moving: each reader's last advance,
// what the timeline holds, who the record knows, and site entries counted
// from a day on.
type Health struct {
	Projections   []CursorAge
	ChainReaders  []CursorAge
	Sources       []SourceCount
	People        []OriginCount
	EntriesSince  time.Time
	Entries       int64
	NewestEntryOn *time.Time
}

// Health reads Growth's own state, with site entries counted from since.
func (p *People) Health(ctx context.Context, since time.Time) (Health, error) {
	projections, err := p.q.AdminProjectionCursors(ctx)
	if err != nil {
		return Health{}, fmt.Errorf("growth: reading the projection cursors: %w", err)
	}
	chain, err := p.q.AdminChainCursors(ctx)
	if err != nil {
		return Health{}, fmt.Errorf("growth: reading the chain cursors: %w", err)
	}
	sources, err := p.q.AdminEventSources(ctx)
	if err != nil {
		return Health{}, fmt.Errorf("growth: counting events by source: %w", err)
	}
	people, err := p.q.AdminPeopleOrigins(ctx)
	if err != nil {
		return Health{}, fmt.Errorf("growth: counting people by origin: %w", err)
	}
	day := since.UTC().Truncate(24 * time.Hour)
	visits, err := p.q.AdminVisitTotals(ctx, pgtype.Date{Time: day, Valid: true})
	if err != nil {
		return Health{}, fmt.Errorf("growth: totalling site entries since %s: %w", day.Format(time.DateOnly), err)
	}
	health := Health{
		Projections: make([]CursorAge, len(projections)), ChainReaders: make([]CursorAge, len(chain)),
		Sources: make([]SourceCount, len(sources)), People: make([]OriginCount, len(people)),
		EntriesSince: day, Entries: visits.Entries,
	}
	for i, row := range projections {
		health.Projections[i] = CursorAge{Origin: row.Origin, AdvancedAt: row.AdvancedAt.Time.UTC()}
	}
	for i, row := range chain {
		health.ChainReaders[i] = CursorAge{Origin: row.Origin, AdvancedAt: row.AdvancedAt.Time.UTC(), LastSlot: row.LastSlot}
	}
	for i, row := range sources {
		health.Sources[i] = SourceCount{Source: row.Source, Events: row.Events, NewestOccurredAt: row.NewestOccurredAt.Time.UTC(), NewestReceivedAt: row.NewestReceivedAt.Time.UTC()}
	}
	for i, row := range people {
		health.People[i] = OriginCount{CreatedFrom: row.CreatedFrom, People: row.People}
	}
	if visits.NewestDay.Valid {
		newest := visits.NewestDay.Time.UTC()
		health.NewestEntryOn = &newest
	}
	return health, nil
}
