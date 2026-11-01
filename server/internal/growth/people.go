package growth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/BeyndtechArc/Seametry/server/internal/identity"
	"github.com/BeyndtechArc/Seametry/server/internal/store/growthdb"
)

// PeopleOrigin names the people record in the events it writes.
const PeopleOrigin = "growth.people"

// People is the record of who Growth knows of. *pgxpool.Pool satisfies db.
type People struct {
	db beginner
	q  *growthdb.Queries
}

func NewPeople(db beginner) *People {
	return &People{db: db, q: growthdb.New(db)}
}

var stages = map[string]bool{
	"lead": true, "visitor": true, "connected": true, "preflighted": true,
	"allocated": true, "repeat": true, "ap": true, "advocate": true,
}

func timestamp(at time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: at.UTC(), Valid: true}
}

func optionalText(value string) pgtype.Text {
	return pgtype.Text{String: value, Valid: value != ""}
}

func (p *People) inTransaction(ctx context.Context, describe string, work func(q *growthdb.Queries) error) (err error) {
	tx, err := p.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("growth: opening the transaction for %s: %w", describe, err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()
	if err = work(p.q.WithTx(tx)); err != nil {
		return err
	}
	if err = tx.Commit(ctx); err != nil {
		return fmt.Errorf("growth: committing %s: %w", describe, err)
	}
	return nil
}

// Join attaches an account the token proved to one person, with each wallet
// the token names, and sees them again without writing a second person. The
// account's verified email is left out: nothing here mails anyone yet, and
// Alert's opt-ins are the only mailable address (plan, section 3).
//
// A wallet already held by another person stays there and the clash is kept
// as identity.conflict: moving it would merge two people on this code's
// guess, and dropping it would hide that they overlap.
func (p *People) Join(ctx context.Context, subject identity.Subject, now time.Time) error {
	if subject.AccountID == "" {
		return errors.New("growth: an account with no id cannot be joined; the subject must come from a verified token")
	}
	return p.inTransaction(ctx, "joining an account", func(q *growthdb.Queries) error {
		person, err := q.PersonOfVerified(ctx, growthdb.PersonOfVerifiedParams{Kind: "account", Value: subject.AccountID})
		switch {
		case errors.Is(err, pgx.ErrNoRows):
			if person, err = q.InsertSignupPerson(ctx, growthdb.InsertSignupPersonParams{DisplayName: "Account " + subject.AccountID, CreatedAt: timestamp(now)}); err != nil {
				return fmt.Errorf("growth: writing the person for account %s: %w", subject.AccountID, err)
			}
		case err != nil:
			return fmt.Errorf("growth: finding account %s: %w", subject.AccountID, err)
		}
		if err := q.AddIdentity(ctx, growthdb.AddIdentityParams{PersonID: person, Kind: "account", Value: subject.AccountID, Provenance: "account_token", Verified: true, FirstSeenAt: timestamp(now)}); err != nil {
			return fmt.Errorf("growth: recording account %s: %w", subject.AccountID, err)
		}
		for _, wallet := range subject.Wallets {
			holder, err := q.PersonOfVerified(ctx, growthdb.PersonOfVerifiedParams{Kind: "wallet", Value: wallet})
			switch {
			case errors.Is(err, pgx.ErrNoRows):
			case err != nil:
				return fmt.Errorf("growth: finding who holds wallet %s: %w", wallet, err)
			case holder != person:
				if err := recordConflict(ctx, q, person, holder, wallet, now); err != nil {
					return err
				}
				continue
			}
			if err := q.AddIdentity(ctx, growthdb.AddIdentityParams{PersonID: person, Kind: "wallet", Value: wallet, Provenance: "signed_message", Verified: true, FirstSeenAt: timestamp(now)}); err != nil {
				return fmt.Errorf("growth: recording wallet %s for account %s: %w", wallet, subject.AccountID, err)
			}
		}
		return nil
	})
}

func recordConflict(ctx context.Context, q *growthdb.Queries, person, holder pgtype.UUID, wallet string, now time.Time) error {
	properties, err := json.Marshal(map[string]string{"held_by": holder.String()})
	if err != nil {
		return fmt.Errorf("growth: encoding the clash over wallet %s: %w", wallet, err)
	}
	_, err = q.InsertPersonEvent(ctx, growthdb.InsertPersonEventParams{
		Type: "identity.conflict", PersonID: person, Wallet: optionalText(wallet), Properties: properties, Source: "server",
		Origin: PeopleOrigin, OriginKey: "conflict:" + person.String() + ":" + wallet, OccurredAt: timestamp(now),
	})
	if err != nil {
		return fmt.Errorf("growth: recording the clash over wallet %s: %w", wallet, err)
	}
	return nil
}

// SetStage moves a person to a stage and logs lead.stage_changed in the same
// transaction, so the stage and its history cannot disagree. Moving to the
// stage they are already in writes nothing.
func (p *People) SetStage(ctx context.Context, person pgtype.UUID, stage, source string, now time.Time) error {
	if !stages[stage] {
		return fmt.Errorf("growth: stage %q is not one of lead, visitor, connected, preflighted, allocated, repeat, ap or advocate", stage)
	}
	return p.inTransaction(ctx, "changing a stage", func(q *growthdb.Queries) error {
		current, err := q.PersonStage(ctx, person)
		if err != nil {
			return fmt.Errorf("growth: reading the stage of person %s: %w", person, err)
		}
		if current == stage {
			return nil
		}
		if err := q.SetPersonStage(ctx, growthdb.SetPersonStageParams{ID: person, Stage: stage, UpdatedAt: timestamp(now)}); err != nil {
			return fmt.Errorf("growth: moving person %s to %s: %w", person, stage, err)
		}
		properties, err := json.Marshal(map[string]string{"from": current, "to": stage})
		if err != nil {
			return fmt.Errorf("growth: encoding the stage change: %w", err)
		}
		_, err = q.InsertPersonEvent(ctx, growthdb.InsertPersonEventParams{
			Type: "lead.stage_changed", PersonID: person, Properties: properties, Source: source,
			Origin: PeopleOrigin, OriginKey: fmt.Sprintf("stage:%s:%s:%d", person, stage, now.UnixNano()), OccurredAt: timestamp(now),
		})
		if err != nil {
			return fmt.Errorf("growth: logging the stage change of person %s: %w", person, err)
		}
		return nil
	})
}
