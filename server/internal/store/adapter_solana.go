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
	// Symbol is not decodable from the account bytes: registry.Mint has no
	// ticker field, only what the mint account itself stores. It travels
	// with the capture because policy.FromRegistry's Input.Symbol feeds
	// the admissibility digest (ENGINEERING_STANDARD.md section 8), and a
	// digest computed under a placeholder symbol would not be the digest
	// of the real instrument.
	Symbol   string `json:"symbol"`
	Owner    string `json:"owner"`
	Lamports uint64 `json:"lamports"`
	DataLen  int    `json:"data_len"`
	// Slot is the chain state this was read at (EXPLORER.md section 3.2:
	// "a fact with no slot is an assertion"). It is not derivable from
	// SourceEventAt, which is a wall clock time; it must be captured at
	// read time and carried here, or a reader of this observation has no
	// slot to cite.
	Slot uint64 `json:"slot"`
}

// NormalizeSolanaAccount is the one place raw account bytes become an
// IngestInput. The live path (CaptureSolanaAccounts) and the replay path
// (server/cmd/seametry's replay command, over shared/fixtures/mainnet) both
// call this, so a replayed fixture and a freshly captured account are
// normalized identically (docs/ENGINEERING_STANDARD.md section 5:
// "replaying stored raw payloads... reproduces the normalized observation
// byte for byte").
func NormalizeSolanaAccount(mint, symbol, owner string, lamports, slot uint64, data []byte, sourceEventAt, receivedAt time.Time) (IngestInput, error) {
	payload, err := json.Marshal(solanaPayload{
		Symbol:   symbol,
		Owner:    owner,
		Lamports: lamports,
		DataLen:  len(data),
		Slot:     slot,
	})
	if err != nil {
		return IngestInput{}, fmt.Errorf("store: normalizing %s: %w", mint, err)
	}
	return IngestInput{
		Mint:              mint,
		RequestKey:        mint, // one request per account: nothing else distinguishes it
		Source:            "solana:mainnet:getMultipleAccounts",
		AdapterVersion:    SolanaAdapterVersion,
		SourceEventAt:     sourceEventAt,
		ReceivedAt:        receivedAt,
		VerificationState: "unverified", // read from a single public RPC endpoint, not cross-confirmed
		Raw:               data,
		Payload:           payload,
	}, nil
}

// Target names one mint worth capturing and the symbol it is known by,
// mirroring server/cmd/capture's own Target: this adapter's live path needs
// the same pairing that command already reads from shared/fixtures/mainnet/
// targets.json.
type Target struct {
	Symbol string
	Mint   string
}

// CaptureSolanaAccounts reads every target's account with client and
// returns one IngestInput per target that came back with data. A missing
// or empty account is skipped, named in the returned slice, never silently
// dropped from the count (ENGINEERING_STANDARD.md section 7: "unknown is
// surfaced, not swallowed" applies as much to "we got nothing back" as to an
// unrecognised value).
func CaptureSolanaAccounts(ctx context.Context, client *solana.Client, targets []Target, commitment string, receivedAt time.Time) ([]IngestInput, []string, error) {
	mints := make([]string, len(targets))
	for i, t := range targets {
		mints[i] = t.Mint
	}
	slot, accounts, err := client.GetMultipleAccounts(ctx, mints, commitment)
	if err != nil {
		return nil, nil, fmt.Errorf("store: capturing Solana accounts: %w", err)
	}

	var inputs []IngestInput
	var skipped []string
	for i, account := range accounts {
		target := targets[i]
		if account == nil || len(account.Data) == 0 {
			skipped = append(skipped, target.Mint)
			continue
		}
		// The RPC response names a slot for the whole call, not a wall
		// clock time; receivedAt is the closest honest estimate of when
		// this was observed, the same choice replay makes from a
		// fixture's own captured_at (below), but the slot itself is real,
		// not estimated.
		input, err := NormalizeSolanaAccount(target.Mint, target.Symbol, account.Owner, account.Lamports, slot, account.Data, receivedAt, receivedAt)
		if err != nil {
			return nil, nil, err
		}
		inputs = append(inputs, input)
	}
	return inputs, skipped, nil
}
