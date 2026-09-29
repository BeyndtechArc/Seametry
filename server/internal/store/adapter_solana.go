package store

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/solana"
)

// SolanaAdapterVersion is recorded on every observation this adapter
// produces (ENGINEERING_STANDARD.md section 5: "adapter version is
// recorded on every observation... old observations remain interpretable
// under the version that produced them"). Bump it whenever
// normalizeSolanaAccount's shape changes.
const SolanaAdapterVersion = "solana-accounts-v1"

// solanaPayload is what this adapter normalizes an account into. It is
// deliberately not the decoded mint (registry.DecodeMint): what an account's
// bytes mean is Registry's concern (docs/SERVICE_CATALOG.md section 3.1),
// consumed from the raw bytes this same capture stores, not from this
// summary. This is Observation's own boundary (section 3.2): the fact that
// something was read, not what it means.
type solanaPayload struct {
	Owner    string `json:"owner"`
	Lamports uint64 `json:"lamports"`
	DataLen  int    `json:"data_len"`
}

// NormalizeSolanaAccount is the one place raw account bytes become an
// IngestInput. The live path (CaptureSolanaAccounts) and the replay path
// (server/cmd/seametry's replay command, over shared/fixtures/mainnet) both
// call this, so a replayed fixture and a freshly captured account are
// normalized identically (docs/ENGINEERING_STANDARD.md section 5:
// "replaying stored raw payloads... reproduces the normalized observation
// byte for byte").
func NormalizeSolanaAccount(mint, owner string, lamports uint64, data []byte, sourceEventAt, receivedAt time.Time) (IngestInput, error) {
	payload, err := json.Marshal(solanaPayload{
		Owner:    owner,
		Lamports: lamports,
		DataLen:  len(data),
	})
	if err != nil {
		return IngestInput{}, fmt.Errorf("store: normalizing %s: %w", mint, err)
	}
	return IngestInput{
		Mint:              mint,
		Source:            "solana:mainnet:getMultipleAccounts",
		AdapterVersion:    SolanaAdapterVersion,
		SourceEventAt:     sourceEventAt,
		ReceivedAt:        receivedAt,
		VerificationState: "unverified", // read from a single public RPC endpoint, not cross-confirmed
		Raw:               data,
		Payload:           payload,
	}, nil
}

// CaptureSolanaAccounts reads every address's account with client and
// returns one IngestInput per address that came back with data. A missing
// or empty account is skipped, named in the returned slice, never silently
// dropped from the count (ENGINEERING_STANDARD.md section 7: "unknown is
// surfaced, not swallowed" applies as much to "we got nothing back" as to an
// unrecognised value).
func CaptureSolanaAccounts(ctx context.Context, client *solana.Client, mints []string, commitment string, receivedAt time.Time) ([]IngestInput, []string, error) {
	_, accounts, err := client.GetMultipleAccounts(ctx, mints, commitment)
	if err != nil {
		return nil, nil, fmt.Errorf("store: capturing Solana accounts: %w", err)
	}

	var inputs []IngestInput
	var skipped []string
	for i, account := range accounts {
		mint := mints[i]
		if account == nil || len(account.Data) == 0 {
			skipped = append(skipped, mint)
			continue
		}
		// The RPC response names a slot, not a wall clock time; receivedAt
		// is the closest honest estimate until slot-to-time resolution
		// exists, the same choice replay makes from a fixture's own
		// captured_at (below).
		input, err := NormalizeSolanaAccount(mint, account.Owner, account.Lamports, account.Data, receivedAt, receivedAt)
		if err != nil {
			return nil, nil, err
		}
		inputs = append(inputs, input)
	}
	return inputs, skipped, nil
}
