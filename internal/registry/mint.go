// Package registry decodes what a tokenized instrument actually is, from the
// bytes of its mint account rather than from anything an issuer published.
//
// This is the admission standard the whole product rests on. A basket of
// tokenized equities is a basket of instruments other parties still control,
// and the controls are written on chain for anyone who decodes them. Almost
// nobody decodes them. A published extension list is evidence of intent at the
// time it was written; the account is what is true now.
//
// Two rules here are not negotiable.
//
// Unknown extensions survive. An extension this package does not implement is
// recorded by number and surfaced, never dropped. A dropped unknown is
// indistinguishable from an absent one at every layer above, which is exactly
// how a new issuer power becomes invisible.
//
// Nothing reads the clock. Multiplier resolution takes the time to resolve at
// as an argument, so a decision is reproducible and a fixture captured today
// still means the same thing next year.
package registry

import (
	"encoding/binary"
	"fmt"
	"math"
	"time"

	"github.com/BeyndtechArc/Seametry/internal/amount"
)

// Program IDs for the two token programs. Only Token-2022 carries extensions.
const (
	TokenProgramID     = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
	Token2022ProgramID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
)

// Pubkey is a 32 byte Solana address.
type Pubkey [32]byte

func (p Pubkey) String() string { return encodeBase58(p[:]) }

// IsZero reports the all zero address, which Token-2022 uses to mean "none"
// inside an OptionalNonZeroPubkey. A zero address is not an address.
func (p Pubkey) IsZero() bool {
	for _, b := range p {
		if b != 0 {
			return false
		}
	}
	return true
}

// ParsePubkey reads a base58 address.
func ParsePubkey(s string) (Pubkey, error) {
	var key Pubkey
	raw, err := decodeBase58(s)
	if err != nil {
		return key, err
	}
	if len(raw) != 32 {
		return key, fmt.Errorf("registry: address %q decodes to %d bytes, want 32", s, len(raw))
	}
	copy(key[:], raw)
	return key, nil
}

// ExtensionType is a Token-2022 TLV discriminator. Values this package does
// not recognise are kept as themselves rather than mapped to anything.
type ExtensionType uint16

const (
	ExtUninitialized                 ExtensionType = 0
	ExtTransferFeeConfig             ExtensionType = 1
	ExtTransferFeeAmount             ExtensionType = 2
	ExtMintCloseAuthority            ExtensionType = 3
	ExtConfidentialTransferMint      ExtensionType = 4
	ExtConfidentialTransferAccount   ExtensionType = 5
	ExtDefaultAccountState           ExtensionType = 6
	ExtImmutableOwner                ExtensionType = 7
	ExtMemoTransfer                  ExtensionType = 8
	ExtNonTransferable               ExtensionType = 9
	ExtInterestBearingConfig         ExtensionType = 10
	ExtCpiGuard                      ExtensionType = 11
	ExtPermanentDelegate             ExtensionType = 12
	ExtNonTransferableAccount        ExtensionType = 13
	ExtTransferHook                  ExtensionType = 14
	ExtTransferHookAccount           ExtensionType = 15
	ExtConfidentialTransferFeeConfig ExtensionType = 16
	ExtConfidentialTransferFeeAmount ExtensionType = 17
	ExtMetadataPointer               ExtensionType = 18
	ExtTokenMetadata                 ExtensionType = 19
	ExtGroupPointer                  ExtensionType = 20
	ExtTokenGroup                    ExtensionType = 21
	ExtGroupMemberPointer            ExtensionType = 22
	ExtTokenGroupMember              ExtensionType = 23
	ExtConfidentialMintBurn          ExtensionType = 24
	ExtScaledUiAmount                ExtensionType = 25
	ExtPausable                      ExtensionType = 26
	ExtPausableAccount               ExtensionType = 27
)

var extensionNames = map[ExtensionType]string{
	ExtTransferFeeConfig: "TransferFeeConfig", ExtTransferFeeAmount: "TransferFeeAmount",
	ExtMintCloseAuthority: "MintCloseAuthority", ExtConfidentialTransferMint: "ConfidentialTransferMint",
	ExtConfidentialTransferAccount: "ConfidentialTransferAccount", ExtDefaultAccountState: "DefaultAccountState",
	ExtImmutableOwner: "ImmutableOwner", ExtMemoTransfer: "MemoTransfer",
	ExtNonTransferable: "NonTransferable", ExtInterestBearingConfig: "InterestBearingConfig",
	ExtCpiGuard: "CpiGuard", ExtPermanentDelegate: "PermanentDelegate",
	ExtNonTransferableAccount: "NonTransferableAccount", ExtTransferHook: "TransferHook",
	ExtTransferHookAccount: "TransferHookAccount", ExtConfidentialTransferFeeConfig: "ConfidentialTransferFeeConfig",
	ExtConfidentialTransferFeeAmount: "ConfidentialTransferFeeAmount", ExtMetadataPointer: "MetadataPointer",
	ExtTokenMetadata: "TokenMetadata", ExtGroupPointer: "GroupPointer",
	ExtTokenGroup: "TokenGroup", ExtGroupMemberPointer: "GroupMemberPointer",
	ExtTokenGroupMember: "TokenGroupMember", ExtConfidentialMintBurn: "ConfidentialMintBurn",
	ExtScaledUiAmount: "ScaledUiAmount", ExtPausable: "Pausable", ExtPausableAccount: "PausableAccount",
}

// String names the extension, or reports the raw number when it is one this
// build does not know. The number is the useful part of an unknown.
func (e ExtensionType) String() string {
	if name, ok := extensionNames[e]; ok {
		return name
	}
	return fmt.Sprintf("Unknown(%d)", uint16(e))
}

// Known reports whether this build recognises the extension.
func (e ExtensionType) Known() bool {
	_, ok := extensionNames[e]
	return ok
}

// Extension is one TLV entry, kept with its bytes so that an extension we do
// not parse can still be re-examined later without another chain read.
type Extension struct {
	Type ExtensionType
	Data []byte
}

// Mint is a decoded Token-2022 or SPL Token mint account.
type Mint struct {
	MintAuthority   *Pubkey
	Supply          uint64
	Decimals        uint8
	IsInitialized   bool
	FreezeAuthority *Pubkey
	Extensions      []Extension
}

// Account layout. The base mint is 82 bytes. Token-2022 then pads to 165, the
// size of a token account, and writes a discriminator at 165 so that a mint
// and an account can never be confused by length alone. Extensions follow.
const (
	baseMintLen       = 82
	accountTypeOffset = 165
	tlvStart          = 166
	accountTypeMint   = 1
)

// DecodeMint reads a mint account's bytes.
func DecodeMint(data []byte) (*Mint, error) {
	if len(data) < baseMintLen {
		return nil, fmt.Errorf("registry: account is %d bytes, too short for a mint (%d)", len(data), baseMintLen)
	}

	mint := &Mint{
		Supply:        binary.LittleEndian.Uint64(data[36:44]),
		Decimals:      data[44],
		IsInitialized: data[45] == 1,
	}
	if binary.LittleEndian.Uint32(data[0:4]) == 1 {
		var key Pubkey
		copy(key[:], data[4:36])
		mint.MintAuthority = &key
	}
	if binary.LittleEndian.Uint32(data[46:50]) == 1 {
		var key Pubkey
		copy(key[:], data[50:82])
		mint.FreezeAuthority = &key
	}

	// A plain SPL Token mint is exactly the base length and carries nothing else.
	if len(data) == baseMintLen {
		return mint, nil
	}
	if len(data) < tlvStart {
		return nil, fmt.Errorf("registry: account is %d bytes, which is longer than a base mint "+
			"but too short to carry the account type discriminator at offset %d", len(data), accountTypeOffset)
	}
	if got := data[accountTypeOffset]; got != accountTypeMint {
		return nil, fmt.Errorf("registry: account type discriminator is %d, want %d (mint)", got, accountTypeMint)
	}

	extensions, err := decodeTLV(data[tlvStart:])
	if err != nil {
		return nil, err
	}
	mint.Extensions = extensions
	return mint, nil
}

func decodeTLV(data []byte) ([]Extension, error) {
	var out []Extension
	for offset := 0; offset+4 <= len(data); {
		extType := ExtensionType(binary.LittleEndian.Uint16(data[offset : offset+2]))
		length := int(binary.LittleEndian.Uint16(data[offset+2 : offset+4]))
		offset += 4

		// Trailing zeros are allocation slack, not an extension of type zero.
		if extType == ExtUninitialized && length == 0 {
			break
		}
		if offset+length > len(data) {
			return nil, fmt.Errorf("registry: extension %s declares %d bytes but only %d remain",
				extType, length, len(data)-offset)
		}

		value := make([]byte, length)
		copy(value, data[offset:offset+length])
		out = append(out, Extension{Type: extType, Data: value})
		offset += length
	}
	return out, nil
}

// Extension returns the first entry of the given type.
func (m *Mint) Extension(t ExtensionType) (Extension, bool) {
	for _, e := range m.Extensions {
		if e.Type == t {
			return e, true
		}
	}
	return Extension{}, false
}

// optionalNonZeroPubkey reads Token-2022's convention where an all zero
// address means none.
func optionalNonZeroPubkey(data []byte) (*Pubkey, error) {
	if len(data) < 32 {
		return nil, fmt.Errorf("registry: %d bytes is too short for an address", len(data))
	}
	var key Pubkey
	copy(key[:], data[:32])
	if key.IsZero() {
		return nil, nil
	}
	return &key, nil
}

// TransferHookState distinguishes the three situations a hook can be in. The
// middle one is the reason this is not a boolean: a hook that exists and is
// switched off can be switched back on by its authority, without warning and
// without any other change to the mint.
type TransferHookState uint8

const (
	// TransferHookAbsent means the extension is not present at all.
	TransferHookAbsent TransferHookState = iota
	// TransferHookInitializedDisabled means the extension is present with no
	// program set. Reported distinctly from absent, always.
	TransferHookInitializedDisabled
	// TransferHookActive means a hook program will run on every transfer.
	TransferHookActive
)

func (s TransferHookState) String() string {
	switch s {
	case TransferHookAbsent:
		return "absent"
	case TransferHookInitializedDisabled:
		return "initialized_disabled"
	case TransferHookActive:
		return "active"
	}
	return fmt.Sprintf("TransferHookState(%d)", uint8(s))
}

// TransferHook is the decoded hook configuration.
type TransferHook struct {
	State     TransferHookState
	Authority *Pubkey
	Program   *Pubkey
}

// AccountState is the DefaultAccountState value. The raw byte is kept so an
// unrecognised state stays visible rather than being flattened into a known
// one.
type AccountState struct {
	Raw byte
}

const (
	accountStateUninitialized = 0
	accountStateInitialized   = 1
	accountStateFrozen        = 2
)

// FreezesNewAccounts reports whether a newly created account for this mint
// starts frozen, which means a recipient cannot receive until the issuer acts.
func (s AccountState) FreezesNewAccounts() bool { return s.Raw == accountStateFrozen }

// Known reports whether the value is one this build understands.
func (s AccountState) Known() bool { return s.Raw <= accountStateFrozen }

func (s AccountState) String() string {
	switch s.Raw {
	case accountStateUninitialized:
		return "uninitialized"
	case accountStateInitialized:
		return "initialized"
	case accountStateFrozen:
		return "frozen"
	}
	return fmt.Sprintf("unknown(%d)", s.Raw)
}

// Pausable is the decoded pause configuration.
type Pausable struct {
	Authority *Pubkey
	Paused    bool
}

// Prerogatives is every power an issuer holds over an instrument, decoded from
// the mint as it stands now.
type Prerogatives struct {
	MintAuthority     *Pubkey
	FreezeAuthority   *Pubkey
	PermanentDelegate *Pubkey
	CloseAuthority    *Pubkey
	ScaledUIAuthority *Pubkey

	Pausable            *Pausable
	TransferHook        TransferHook
	DefaultAccountState *AccountState

	HasTransferFee     bool
	NonTransferable    bool
	HasInterestBearing bool
	HasConfidential    bool

	// UnknownExtensions holds every extension type this build does not
	// recognise. It is surfaced rather than dropped, because an issuer power
	// we have not implemented is a fact about the instrument and not a gap in
	// our model.
	UnknownExtensions []ExtensionType
}

// Prerogatives decodes every issuer power from the mint.
func (m *Mint) Prerogatives() (Prerogatives, error) {
	p := Prerogatives{
		MintAuthority:   m.MintAuthority,
		FreezeAuthority: m.FreezeAuthority,
	}

	for _, ext := range m.Extensions {
		switch ext.Type {
		case ExtPermanentDelegate:
			key, err := optionalNonZeroPubkey(ext.Data)
			if err != nil {
				return p, fmt.Errorf("registry: PermanentDelegate: %w", err)
			}
			p.PermanentDelegate = key

		case ExtMintCloseAuthority:
			key, err := optionalNonZeroPubkey(ext.Data)
			if err != nil {
				return p, fmt.Errorf("registry: MintCloseAuthority: %w", err)
			}
			p.CloseAuthority = key

		case ExtPausable:
			if len(ext.Data) < 33 {
				return p, fmt.Errorf("registry: Pausable is %d bytes, want 33", len(ext.Data))
			}
			authority, err := optionalNonZeroPubkey(ext.Data)
			if err != nil {
				return p, fmt.Errorf("registry: Pausable: %w", err)
			}
			p.Pausable = &Pausable{Authority: authority, Paused: ext.Data[32] == 1}

		case ExtTransferHook:
			if len(ext.Data) < 64 {
				return p, fmt.Errorf("registry: TransferHook is %d bytes, want 64", len(ext.Data))
			}
			authority, err := optionalNonZeroPubkey(ext.Data[0:32])
			if err != nil {
				return p, fmt.Errorf("registry: TransferHook authority: %w", err)
			}
			program, err := optionalNonZeroPubkey(ext.Data[32:64])
			if err != nil {
				return p, fmt.Errorf("registry: TransferHook program: %w", err)
			}
			state := TransferHookInitializedDisabled
			if program != nil {
				state = TransferHookActive
			}
			p.TransferHook = TransferHook{State: state, Authority: authority, Program: program}

		case ExtDefaultAccountState:
			if len(ext.Data) < 1 {
				return p, fmt.Errorf("registry: DefaultAccountState is empty")
			}
			state := AccountState{Raw: ext.Data[0]}
			p.DefaultAccountState = &state

		case ExtScaledUiAmount:
			config, err := decodeScaledUIAmount(ext.Data)
			if err != nil {
				return p, err
			}
			p.ScaledUIAuthority = config.Authority

		case ExtTransferFeeConfig:
			p.HasTransferFee = true
		case ExtNonTransferable:
			p.NonTransferable = true
		case ExtInterestBearingConfig:
			p.HasInterestBearing = true
		case ExtConfidentialTransferMint, ExtConfidentialMintBurn:
			p.HasConfidential = true

		case ExtMetadataPointer, ExtTokenMetadata, ExtGroupPointer, ExtTokenGroup,
			ExtGroupMemberPointer, ExtTokenGroupMember, ExtConfidentialTransferFeeConfig:
			// Known, and carrying no issuer power over a holder.

		default:
			if !ext.Type.Known() {
				p.UnknownExtensions = append(p.UnknownExtensions, ext.Type)
			}
		}
	}
	return p, nil
}

// Sentences renders each power as a plain statement, in the product's voice.
//
// Every issuer holding a given power gets the identical sentence. The world is
// eerie about power in general and never hostile to any issuer in particular,
// and an icon alone is not a sentence.
func (p Prerogatives) Sentences() []string {
	var out []string
	if p.FreezeAuthority != nil {
		out = append(out, "The issuer can freeze this where it sits.")
	}
	if p.Pausable != nil {
		if p.Pausable.Paused {
			out = append(out, "The issuer has paused all movement of this.")
		} else {
			out = append(out, "The issuer can pause all movement of this.")
		}
	}
	if p.PermanentDelegate != nil {
		out = append(out, "The issuer can take this back from any wallet.")
	}
	switch p.TransferHook.State {
	case TransferHookActive:
		out = append(out, "The issuer checks who may receive this.")
	case TransferHookInitializedDisabled:
		out = append(out, "The issuer can switch on a check of who may receive this.")
	}
	if p.DefaultAccountState != nil && p.DefaultAccountState.FreezesNewAccounts() {
		out = append(out, "A new account for this starts frozen until the issuer approves it.")
	}
	if p.ScaledUIAuthority != nil {
		out = append(out, "The issuer can change how many of these you appear to hold.")
	}
	if p.MintAuthority != nil {
		out = append(out, "The issuer can create more of these.")
	}
	if p.HasTransferFee {
		out = append(out, "The issuer takes a fee on every transfer of this.")
	}
	if p.NonTransferable {
		out = append(out, "This cannot be transferred at all.")
	}
	for _, unknown := range p.UnknownExtensions {
		out = append(out, fmt.Sprintf(
			"This carries an issuer control Seametry does not yet decode (Token-2022 extension %d).",
			uint16(unknown)))
	}
	return out
}

// ScaledUIAmount is the decoded Scaled UI Amount configuration.
//
// The multipliers are float64 because that is how Token-2022 stores them. Read
// them through Resolve, which converts exactly to decimal, rather than
// calculating with these fields.
type ScaledUIAmount struct {
	Authority                *Pubkey
	Multiplier               float64
	NewMultiplierEffectiveAt time.Time
	NewMultiplier            float64
}

const scaledUIAmountLen = 56 // 32 authority + 8 multiplier + 8 timestamp + 8 new multiplier

func decodeScaledUIAmount(data []byte) (ScaledUIAmount, error) {
	var config ScaledUIAmount
	if len(data) < scaledUIAmountLen {
		return config, fmt.Errorf("registry: ScaledUiAmount is %d bytes, want %d", len(data), scaledUIAmountLen)
	}
	authority, err := optionalNonZeroPubkey(data[0:32])
	if err != nil {
		return config, fmt.Errorf("registry: ScaledUiAmount authority: %w", err)
	}
	config.Authority = authority
	config.Multiplier = math.Float64frombits(binary.LittleEndian.Uint64(data[32:40]))
	config.NewMultiplierEffectiveAt = time.Unix(int64(binary.LittleEndian.Uint64(data[40:48])), 0).UTC()
	config.NewMultiplier = math.Float64frombits(binary.LittleEndian.Uint64(data[48:56]))
	return config, nil
}

// ScaledUIAmount returns the mint's Scaled UI Amount configuration.
func (m *Mint) ScaledUIAmount() (ScaledUIAmount, bool, error) {
	ext, ok := m.Extension(ExtScaledUiAmount)
	if !ok {
		return ScaledUIAmount{}, false, nil
	}
	config, err := decodeScaledUIAmount(ext.Data)
	return config, true, err
}

// MultiplierSource names which field the live value came from.
type MultiplierSource string

const (
	// MultiplierFromCurrent means the value came from the field named multiplier.
	MultiplierFromCurrent MultiplierSource = "multiplier"
	// MultiplierFromNew means a scheduled activation has taken effect and the
	// live value came from new_multiplier.
	MultiplierFromNew MultiplierSource = "new_multiplier"
)

// ResolvedMultiplier is the live multiplier and the evidence for it.
type ResolvedMultiplier struct {
	// Value is the live multiplier, exact.
	Value amount.Amount
	// Source is the field it came from.
	Source MultiplierSource
	// EffectiveAt is when the scheduled activation takes or took effect.
	EffectiveAt time.Time
	// ActivationPending reports a scheduled change that has not yet taken
	// effect. Returning new_multiplier early is the opposite error from
	// reading the stale field and is just as wrong.
	ActivationPending bool

	// NaiveValue is what reading the field named multiplier alone would give.
	NaiveValue amount.Amount
	// NaiveIsStale reports that such a reader would be wrong right now. This
	// is not a diagnostic: it is the product, and it is surfaced to users.
	NaiveIsStale bool
}

// Resolve returns the live multiplier as of a given instant.
//
// The rule: new_multiplier once its effective timestamp has passed, otherwise
// multiplier. Reading the field named multiplier alone leaves a reader one
// corporate action behind, and on mainnet that is not a rare edge. In a survey
// of 1026 xStocks mints on 23 September 2026, 385 of them, 37.5 percent, had a
// stale multiplier field, and the worst cases were ten for one splits where the
// obvious field still read 1.0.
//
// asOf is an argument and never the wall clock, so the same inputs always give
// the same answer and a captured fixture keeps its meaning.
func (s ScaledUIAmount) Resolve(asOf time.Time) (ResolvedMultiplier, error) {
	current, err := amount.FromFloat64Exact(s.Multiplier)
	if err != nil {
		return ResolvedMultiplier{}, fmt.Errorf("registry: multiplier: %w", err)
	}
	scheduled, err := amount.FromFloat64Exact(s.NewMultiplier)
	if err != nil {
		return ResolvedMultiplier{}, fmt.Errorf("registry: new_multiplier: %w", err)
	}

	resolved := ResolvedMultiplier{
		Value:       current,
		Source:      MultiplierFromCurrent,
		EffectiveAt: s.NewMultiplierEffectiveAt,
		NaiveValue:  current,
	}
	if !asOf.Before(s.NewMultiplierEffectiveAt) {
		resolved.Value = scheduled
		resolved.Source = MultiplierFromNew
	} else if !scheduled.Equal(current) {
		resolved.ActivationPending = true
	}
	resolved.NaiveIsStale = !resolved.Value.Equal(current)
	return resolved, nil
}
