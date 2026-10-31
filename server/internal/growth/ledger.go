package growth

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/BeyndtechArc/Seametry/server/internal/store/growthdb"
)

// LedgerOrigin names the lead ledger in the events an import writes.
const LedgerOrigin = "growth.ledger"

const ledgerSchema = "seametry.leads.v1"

var (
	xHandleShape = regexp.MustCompile(`^@[A-Za-z0-9_]{1,15}$`)
	tierShape    = regexp.MustCompile(`^P[1-9]$`)
)

var outreachStatuses = map[string]string{
	"Not contacted": "not_contacted", "Sent": "sent", "Replied": "replied",
	"Call booked": "call_booked", "Testing": "testing", "Customer": "customer", "Pass": "pass",
}

var lawfulBases = map[string]bool{"consent": true, "legitimate_interest": true, "contract": true}

// Lead is one row of a seametry.leads.v1 ledger, every field as exported.
type Lead struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Org        string `json:"org"`
	Segment    string `json:"segment"`
	Handle     string `json:"handle"`
	URL        string `json:"url"`
	Channel    string `json:"channel"`
	Source     string `json:"source"`
	Topics     string `json:"topics"`
	SignalText string `json:"signalText"`
	Angle      string `json:"angle"`
	Fit        int32  `json:"fit"`
	Signal     int32  `json:"signal"`
	Reach      int32  `json:"reach"`
	Engagement int32  `json:"engagement"`
	Score      int32  `json:"score"`
	Tier       string `json:"tier"`
	Status     string `json:"status"`
	UpdatedAt  string `json:"updatedAt"`
	Added      string `json:"added"`
}

// Ledger is a parsed lead file. Batch names it, so the whole set can be
// removed in one step if its use is not allowed.
type Ledger struct {
	Batch string
	Leads []Lead
}

// ParseLedger refuses a file it cannot hold completely: an unknown field, a
// status or tier it does not know, or a repeated lead id. Mapping or skipping
// any of those would make the imported record quietly differ from the file.
// Errors name the lead's id, never its name or handle, because they reach
// logs and this data is third parties'.
func ParseLedger(raw []byte) (Ledger, error) {
	var file struct {
		Schema     string `json:"schema"`
		ExportedAt string `json:"exportedAt"`
		Leads      []Lead `json:"leads"`
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&file); err != nil {
		return Ledger{}, fmt.Errorf("growth: the ledger does not decode as %s: %w", ledgerSchema, err)
	}
	if file.Schema != ledgerSchema {
		return Ledger{}, fmt.Errorf("growth: the ledger's schema is %q, expected %q; a new schema needs its fields mapped here first", file.Schema, ledgerSchema)
	}
	exported, err := time.Parse(time.RFC3339, file.ExportedAt)
	if err != nil {
		return Ledger{}, fmt.Errorf("growth: the ledger's exportedAt %q is not an RFC 3339 time: %w", file.ExportedAt, err)
	}
	seen := make(map[string]bool, len(file.Leads))
	for i, lead := range file.Leads {
		if lead.ID == "" {
			return Ledger{}, fmt.Errorf("growth: lead %d has no id, and the id is what makes a second import change nothing", i)
		}
		if seen[lead.ID] {
			return Ledger{}, fmt.Errorf("growth: lead id %s appears twice", lead.ID)
		}
		seen[lead.ID] = true
		if lead.Name == "" {
			return Ledger{}, fmt.Errorf("growth: lead %s has no name", lead.ID)
		}
		if _, known := outreachStatuses[lead.Status]; !known {
			return Ledger{}, fmt.Errorf("growth: lead %s has status %q, which the record does not know; add it to outreachStatuses and the outreach_status check", lead.ID, lead.Status)
		}
		if !tierShape.MatchString(lead.Tier) {
			return Ledger{}, fmt.Errorf("growth: lead %s has tier %q, expected P1 to P9", lead.ID, lead.Tier)
		}
		if _, err := time.Parse(time.DateOnly, lead.Added); err != nil {
			return Ledger{}, fmt.Errorf("growth: lead %s has added date %q, expected YYYY-MM-DD: %w", lead.ID, lead.Added, err)
		}
	}
	return Ledger{Batch: "ledger-" + exported.UTC().Format("2006-01-02T150405Z"), Leads: file.Leads}, nil
}

type leadIdentity struct{ kind, value string }

// identities reads what a lead's public fields claim. An @handle is an X
// handle, which X treats case-insensitively. A bare handle is unrecognised:
// the ledger holds names and shortened addresses there, and calling either
// a known kind would be a guess. Other pages are web, because an x.com link
// in this file is as often a post as a profile.
func (l Lead) identities() []leadIdentity {
	var found []leadIdentity
	switch {
	case xHandleShape.MatchString(l.Handle):
		found = append(found, leadIdentity{"x", strings.ToLower(strings.TrimPrefix(l.Handle, "@"))})
	case l.Handle != "":
		found = append(found, leadIdentity{"unrecognised", l.Handle})
	}
	if l.URL != "" {
		kind := "web"
		if parsed, err := url.Parse(l.URL); err == nil && parsed.Host == "colosseum.com" && strings.HasPrefix(parsed.Path, "/projects/") {
			kind = "colosseum"
		}
		found = append(found, leadIdentity{kind, l.URL})
	}
	return found
}

func (l Lead) digest() (string, error) {
	encoded, err := json.Marshal(l)
	if err != nil {
		return "", fmt.Errorf("growth: encoding lead %s: %w", l.ID, err)
	}
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:]), nil
}

// ImportDiff is what an import would change, counted, with lead ids and
// nothing else about any person, because it is printed to a terminal.
type ImportDiff struct {
	Batch      string
	New        []string
	Changed    []string
	Unchanged  int
	NotInFile  int
	Identities map[string]int
	// SharedIdentities counts identity values more than one lead in the file
	// claims, by kind: one project page often names a whole team.
	SharedIdentities map[string]int
}

// Diff compares a ledger with the record and writes nothing.
func (p *People) Diff(ctx context.Context, ledger Ledger) (ImportDiff, error) {
	stored, err := p.q.ImportedDigests(ctx)
	if err != nil {
		return ImportDiff{}, fmt.Errorf("growth: reading the imported leads: %w", err)
	}
	digests := make(map[string]string, len(stored))
	for _, row := range stored {
		digests[row.ImportKey.String] = row.ImportDigest.String
	}
	diff := ImportDiff{Batch: ledger.Batch, Identities: map[string]int{}, SharedIdentities: map[string]int{}}
	claims := map[leadIdentity]int{}
	inFile := 0
	for _, lead := range ledger.Leads {
		digest, err := lead.digest()
		if err != nil {
			return ImportDiff{}, err
		}
		held, known := digests[lead.ID]
		switch {
		case !known:
			diff.New = append(diff.New, lead.ID)
		case held != digest:
			diff.Changed = append(diff.Changed, lead.ID)
			inFile++
		default:
			diff.Unchanged++
			inFile++
		}
		for _, claim := range lead.identities() {
			diff.Identities[claim.kind]++
			claims[claim]++
		}
	}
	diff.NotInFile = len(digests) - inFile
	for claim, count := range claims {
		if count > 1 {
			diff.SharedIdentities[claim.kind]++
		}
	}
	sort.Strings(diff.New)
	sort.Strings(diff.Changed)
	return diff, nil
}

// Import writes a ledger in one transaction: every lead, or none. Lawful
// basis has no default because choosing one is a decision about third
// parties that belongs to whoever runs the import. A lead already imported
// keeps its stage, outreach status and lead.imported event.
func (p *People) Import(ctx context.Context, ledger Ledger, lawfulBasis, basisNote string, now time.Time) (ImportDiff, error) {
	if !lawfulBases[lawfulBasis] {
		return ImportDiff{}, fmt.Errorf("growth: lawful basis %q is not consent, legitimate_interest or contract; an import needs one stated", lawfulBasis)
	}
	if strings.TrimSpace(basisNote) == "" {
		return ImportDiff{}, errors.New("growth: an import needs a note saying where the lawful basis is recorded, such as the assessment it rests on")
	}
	diff, err := p.Diff(ctx, ledger)
	if err != nil {
		return ImportDiff{}, err
	}
	err = p.inTransaction(ctx, "importing a ledger", func(q *growthdb.Queries) error {
		for _, lead := range ledger.Leads {
			if err := writeLead(ctx, q, lead, ledger.Batch, lawfulBasis, basisNote, now); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return ImportDiff{}, err
	}
	return diff, nil
}

func writeLead(ctx context.Context, q *growthdb.Queries, lead Lead, batch, lawfulBasis, basisNote string, now time.Time) error {
	digest, err := lead.digest()
	if err != nil {
		return err
	}
	detail, err := json.Marshal(map[string]string{
		"cohort": lead.Org, "segment": lead.Segment, "url": lead.URL, "channel": lead.Channel, "source": lead.Source,
		"topics": lead.Topics, "signal_text": lead.SignalText, "angle": lead.Angle, "ledger_updated_at": lead.UpdatedAt, "added": lead.Added,
	})
	if err != nil {
		return fmt.Errorf("growth: encoding lead %s: %w", lead.ID, err)
	}
	person, err := q.UpsertImportedPerson(ctx, growthdb.UpsertImportedPersonParams{
		DisplayName: lead.Name, OutreachStatus: outreachStatuses[lead.Status],
		LawfulBasis: pgtype.Text{String: lawfulBasis, Valid: true}, LawfulBasisNote: pgtype.Text{String: basisNote, Valid: true},
		ImportBatch: pgtype.Text{String: batch, Valid: true}, ImportKey: pgtype.Text{String: lead.ID, Valid: true}, ImportDigest: pgtype.Text{String: digest, Valid: true},
		ImportedFit: pgtype.Int4{Int32: lead.Fit, Valid: true}, ImportedSignal: pgtype.Int4{Int32: lead.Signal, Valid: true}, ImportedReach: pgtype.Int4{Int32: lead.Reach, Valid: true},
		ImportedEngagement: pgtype.Int4{Int32: lead.Engagement, Valid: true}, ImportedScore: pgtype.Int4{Int32: lead.Score, Valid: true},
		ImportedTier: pgtype.Text{String: lead.Tier, Valid: true}, ImportDetail: detail, At: timestamp(now),
	})
	if err != nil {
		return fmt.Errorf("growth: writing lead %s: %w", lead.ID, err)
	}
	for _, claim := range lead.identities() {
		if err := q.AddIdentity(ctx, growthdb.AddIdentityParams{PersonID: person, Kind: claim.kind, Value: claim.value, Provenance: "import", Verified: false, FirstSeenAt: timestamp(now)}); err != nil {
			return fmt.Errorf("growth: recording a %s identity for lead %s: %w", claim.kind, lead.ID, err)
		}
	}
	added, err := time.Parse(time.DateOnly, lead.Added)
	if err != nil {
		return fmt.Errorf("growth: lead %s added date: %w", lead.ID, err)
	}
	properties, err := json.Marshal(map[string]string{"batch": batch, "source": lead.Source})
	if err != nil {
		return fmt.Errorf("growth: encoding the import of lead %s: %w", lead.ID, err)
	}
	if _, err := q.InsertPersonEvent(ctx, growthdb.InsertPersonEventParams{
		Type: "lead.imported", PersonID: person, Properties: properties, Source: "import",
		Origin: LedgerOrigin, OriginKey: lead.ID, OccurredAt: timestamp(added),
	}); err != nil {
		return fmt.Errorf("growth: logging the import of lead %s: %w", lead.ID, err)
	}
	return nil
}

// RemoveImport deletes one batch's people, with their identities and events.
// A person who has since signed in stays.
func (p *People) RemoveImport(ctx context.Context, batch string) (int64, error) {
	removed, err := p.q.RemoveImportBatch(ctx, pgtype.Text{String: batch, Valid: true})
	if err != nil {
		return 0, fmt.Errorf("growth: removing import %s: %w", batch, err)
	}
	return removed, nil
}
