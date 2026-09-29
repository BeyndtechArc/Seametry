package basket

import (
	"crypto/sha256"
	"encoding/binary"
	"fmt"
	"math/big"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/registry"
)

// MaxConstituents mirrors chain/programs/hall/src/state.rs::MAX_CONSTITUENTS.
// It is not read from the program's own IDL: nothing in this build parses
// one yet, so this is a second, hand kept copy of a number the Rust program
// also hard codes, and the two can drift. chain_test.go's own decode test
// catches a legs slice that does not end where a 2080 byte real account
// says it should, which is the only signal available that they still agree.
const (
	MaxConstituents = 12
	// HallDevnetProgramID is the immutable address deployed in
	// chain/Anchor.toml. Mainnet remains gated by the legal read and audit.
	HallDevnetProgramID = "4wmfRdQguyhGCvZe4FXHo7Kpx5aWbRBHPBbs8k6XRjDx"
)

// legRecordSize and alloyFixedSize are chain/programs/hall/src/state.rs's
// own LegRecord and the fields of Alloy before its legs array, in bytes,
// confirmed against a real devnet account
// (shared/fixtures/hall-devnet/alloy.json) before this file was written:
// the account's own length matched alloyFixedSize + MaxConstituents *
// legRecordSize + 8 (the Anchor discriminator) exactly, with nothing left
// over.
const (
	legRecordSize     = 32 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 // mint, token_program, hall_account, ledger, pending, unclaimed, vest_start, vest_end, claim_index_low, claim_index_high, claim_epoch
	alloyFixedSize    = 32 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 8 + 1 + 7 // sponsor, sponsor_mark, share_mint, id, version, created_at, supply, locked_genesis, constituent_count, bump, _reserved
	discriminatorSize = 8

	// AlloyAccountSize is shared by the RPC data-size filter and the decoder.
	AlloyAccountSize = discriminatorSize + alloyFixedSize + MaxConstituents*legRecordSize
)

// alloyDiscriminator is Anchor's own convention for a zero copy account:
// the first 8 bytes of sha256("account:<TypeName>"), computed here rather
// than hard coded so a rename of the Rust type is at least a value that no
// longer decodes anything, not a silent mismatch. Confirmed once against
// the real fixture: it equals the fixture's own first 8 bytes exactly.
func alloyDiscriminator() [8]byte {
	sum := sha256.Sum256([]byte("account:Alloy"))
	var d [8]byte
	copy(d[:], sum[:8])
	return d
}

// ChainAlloy is chain/programs/hall/src/state.rs::Alloy, decoded from a raw
// account. Every field name matches the Rust struct's own field name.
type ChainAlloy struct {
	Address          registry.Pubkey
	Sponsor          registry.Pubkey
	SponsorMark      [32]byte
	ShareMint        registry.Pubkey
	ID               uint64
	Version          uint64
	CreatedAt        time.Time
	Supply           uint64
	LockedGenesis    uint64
	ConstituentCount uint64
	Bump             uint8
	Legs             []ChainLeg
}

// ChainLeg is chain/programs/hall/src/state.rs::LegRecord, decoded. Its
// account has no held-back flag of its own: chain/programs/hall/src/
// state.rs stores none. Whether a leg is held back is derived by reading
// HallAccount itself and checking its own frozen state, which needs
// another account read this type does not make.
type ChainLeg struct {
	Mint         registry.Pubkey
	TokenProgram registry.Pubkey
	HallAccount  registry.Pubkey
	Ledger       uint64
	Pending      uint64
	Unclaimed    uint64
	VestStart    time.Time
	VestEnd      time.Time
	// ClaimIndex is claim_index_low and claim_index_high recombined into
	// the single u128 chain/programs/hall/src/claim.rs treats them as
	// (state.rs's own comment: "the claim index as two halves, because a
	// u128 would force 16 byte alignment on a zero-copy struct"). Nil when
	// both halves are zero, matching LegRecord.leg()'s own "both zero
	// means unset."
	ClaimIndex *big.Int
	ClaimEpoch uint64
}

// DecodeAlloy decodes one Alloy account's raw bytes. It refuses data of the
// wrong length or the wrong discriminator rather than guessing: a
// zero-copy struct reinterpreted from bytes of the wrong shape is memory
// that means nothing, in Rust or in Go.
func DecodeAlloy(address registry.Pubkey, data []byte) (*ChainAlloy, error) {
	want := AlloyAccountSize
	if len(data) != want {
		return nil, fmt.Errorf("basket: Alloy account is %d bytes, want %d (chain/programs/hall/src/state.rs::Alloy with %d constituents)", len(data), want, MaxConstituents)
	}
	disc := alloyDiscriminator()
	if [8]byte(data[:8]) != disc {
		return nil, fmt.Errorf("basket: %x is not an Alloy account (discriminator %x, want %x)", address, data[:8], disc)
	}

	b := data[discriminatorSize:]
	a := &ChainAlloy{
		Address:          address,
		Sponsor:          registry.Pubkey(b[0:32]),
		ShareMint:        registry.Pubkey(b[64:96]),
		ID:               binary.LittleEndian.Uint64(b[96:104]),
		Version:          binary.LittleEndian.Uint64(b[104:112]),
		CreatedAt:        time.Unix(int64(binary.LittleEndian.Uint64(b[112:120])), 0).UTC(),
		Supply:           binary.LittleEndian.Uint64(b[120:128]),
		LockedGenesis:    binary.LittleEndian.Uint64(b[128:136]),
		ConstituentCount: binary.LittleEndian.Uint64(b[136:144]),
		Bump:             b[144],
	}
	copy(a.SponsorMark[:], b[32:64])

	legsStart := alloyFixedSize
	count := a.ConstituentCount
	if count > MaxConstituents {
		return nil, fmt.Errorf("basket: %s reports %d constituents, more than MaxConstituents (%d)", address, count, MaxConstituents)
	}
	a.Legs = make([]ChainLeg, count)
	for i := range a.Legs {
		l := b[legsStart+i*legRecordSize : legsStart+(i+1)*legRecordSize]
		leg := ChainLeg{
			Mint:         registry.Pubkey(l[0:32]),
			TokenProgram: registry.Pubkey(l[32:64]),
			HallAccount:  registry.Pubkey(l[64:96]),
			Ledger:       binary.LittleEndian.Uint64(l[96:104]),
			Pending:      binary.LittleEndian.Uint64(l[104:112]),
			Unclaimed:    binary.LittleEndian.Uint64(l[112:120]),
			VestStart:    time.Unix(int64(binary.LittleEndian.Uint64(l[120:128])), 0).UTC(),
			VestEnd:      time.Unix(int64(binary.LittleEndian.Uint64(l[128:136])), 0).UTC(),
			ClaimEpoch:   binary.LittleEndian.Uint64(l[152:160]),
		}
		low := binary.LittleEndian.Uint64(l[136:144])
		high := binary.LittleEndian.Uint64(l[144:152])
		if low != 0 || high != 0 {
			claim := new(big.Int).Lsh(new(big.Int).SetUint64(high), 64)
			claim.Or(claim, new(big.Int).SetUint64(low))
			leg.ClaimIndex = claim
		}
		a.Legs[i] = leg
	}
	return a, nil
}

// TokenAccountFrozen reads a Token or Token-2022 account's own state byte,
// at the fixed offset the base 165 byte layout gives it regardless of
// which extensions follow (confirmed against a real devnet leg account,
// shared/fixtures/hall-devnet/leg-0-hall-account.json, which carries
// Token-2022 extensions past byte 165 and still has state at 108). 2 is
// frozen; anything else is not, including a state this decoder does not
// otherwise recognise, since "not confirmed frozen" is the only claim this
// function makes.
func TokenAccountFrozen(data []byte) (bool, error) {
	const stateOffset = 108
	if len(data) <= stateOffset {
		return false, fmt.Errorf("basket: a token account is %d bytes, too short to hold a state byte at %d", len(data), stateOffset)
	}
	return data[stateOffset] == 2, nil
}
