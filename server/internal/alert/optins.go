package alert

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"net/mail"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/BeyndtechArc/Seametry/server/internal/base58"
	"github.com/BeyndtechArc/Seametry/server/internal/store/alertdb"
)

// OptIns keeps the addresses visitors gave, with consent, to hear when the
// Hall launches and when their trades settle, and withdraws them. It sends
// nothing: no sender exists for these addresses, and the team's mailer only
// writes to the team's own inbox.
type OptIns struct {
	q   *alertdb.Queries
	now func() time.Time
}

func NewOptIns(db alertdb.DBTX) *OptIns {
	return &OptIns{q: alertdb.New(db), now: time.Now}
}

// ErrUnknownToken answers an unsubscribe token no kept address carries: it
// was mistyped, or already used.
var ErrUnknownToken = errors.New("alert: no kept address carries this unsubscribe token")

type OptIn struct {
	Address        string
	ConsentVersion string
	RefCode        string
	// Wallet is unverified metadata: the wallet the browser said was
	// connected, checked only for shape. No signature proves the holder
	// controls it, and the row stores it with wallet_verified false.
	Wallet     string
	Page       string
	Deployment string
}

var (
	consentVersion = regexp.MustCompile(`^[a-z0-9][a-z0-9.-]{0,39}$`)
	refCode        = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,39}$`)
)

func (o OptIn) check() (OptIn, error) {
	o.Address = strings.TrimSpace(o.Address)
	parsed, err := mail.ParseAddress(o.Address)
	if err != nil || parsed.Address != o.Address || len(o.Address) > 254 {
		return o, Invalid{Field: "address", Code: "malformed", Reason: "address is not one plain email address of at most 254 characters"}
	}
	if !consentVersion.MatchString(o.ConsentVersion) {
		return o, Invalid{Field: "consent_version", Code: "malformed", Reason: fmt.Sprintf("consent_version %q is not a version name: lowercase letters, digits, dots and hyphens, at most 40", o.ConsentVersion)}
	}
	if o.RefCode != "" && !refCode.MatchString(o.RefCode) {
		return o, Invalid{Field: "ref_code", Code: "malformed", Reason: fmt.Sprintf("ref_code %q is not a recorded ref code (lowercase, at most 40 characters)", o.RefCode)}
	}
	if o.Wallet != "" {
		if decoded, err := base58.Decode(o.Wallet); err != nil || len(decoded) != 32 {
			return o, Invalid{Field: "wallet", Code: "malformed", Reason: fmt.Sprintf("wallet %q is not a 32-byte base58 Solana address", o.Wallet)}
		}
	}
	switch o.Page {
	case "", "first_allocation", "feedback":
	default:
		return o, Invalid{Field: "page", Code: "unknown_value", Reason: fmt.Sprintf("page %q is not first_allocation or feedback", o.Page)}
	}
	switch o.Deployment {
	case "production", "preview", "development":
	default:
		return o, Invalid{Field: "deployment", Code: "unknown_value", Reason: fmt.Sprintf("deployment %q is not production, preview or development", o.Deployment)}
	}
	return o, nil
}

// Keep records the consent and returns the unsubscribe token its link
// carries. Consenting again with the same address replaces the token.
func (o *OptIns) Keep(ctx context.Context, optIn OptIn) (string, error) {
	valid, err := optIn.check()
	if err != nil {
		return "", err
	}
	id, err := newID()
	if err != nil {
		return "", err
	}
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return "", fmt.Errorf("alert: drawing an unsubscribe token: %w", err)
	}
	token, err := o.q.UpsertEmailOptIn(ctx, alertdb.UpsertEmailOptInParams{
		ID: pgtype.UUID{Bytes: id, Valid: true}, Address: text(valid.Address), ConsentVersion: valid.ConsentVersion,
		ConsentedAt: pgtype.Timestamptz{Time: o.now().UTC(), Valid: true}, RefCode: text(valid.RefCode), Wallet: text(valid.Wallet),
		Page: text(valid.Page), Deployment: valid.Deployment, UnsubscribeToken: text(base58.Encode(secret)),
	})
	if err != nil {
		return "", fmt.Errorf("alert: keeping an email opt-in: %w", err)
	}
	return token.String, nil
}

// Withdraw erases the address a token belongs to, with its wallet and the
// token itself, keeping only when consent was given and withdrawn.
func (o *OptIns) Withdraw(ctx context.Context, token string) error {
	if token == "" || len(token) > 100 {
		return ErrUnknownToken
	}
	withdrawn, err := o.q.WithdrawEmailOptIn(ctx, alertdb.WithdrawEmailOptInParams{
		Token: pgtype.Text{String: token, Valid: true}, WithdrawnAt: pgtype.Timestamptz{Time: o.now().UTC(), Valid: true},
	})
	if err != nil {
		return fmt.Errorf("alert: withdrawing an email opt-in: %w", err)
	}
	if withdrawn == 0 {
		return ErrUnknownToken
	}
	return nil
}
