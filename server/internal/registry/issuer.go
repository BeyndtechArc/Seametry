package registry

// Issuer is a tokenizer this registry recognises, and the legal shape every
// token it issues takes (docs/SERVICE_CATALOG.md, the grade table).
type Issuer struct {
	Name  string
	Grade string
}

// Grades, as docs/SERVICE_CATALOG.md defines them. Ungraded blocks execution
// by default, through policy.Default's AcceptedGrades.
const (
	GradeEntitlement = "entitlement"
	GradeCertificate = "certificate"
	GradeUngraded    = "ungraded"
)

// issuersByFreezeAuthority recognises an issuer from the keys its mint
// carries rather than from a symbol or a name, which are free text: Jupiter
// listed at least six tokens called SPCX on 7 October 2026, one of them
// Backpack's. Each issuer holds the same freeze, take-back and pause keys on
// every token it has issued (TestEveryFixtureIsRecognisedAsItsIssuer checks
// this against every fixture). This refuses a copy by name, not a copy by
// keys: a new mint may name any key as its authority, which hands that issuer
// power over it without making it the issuer's product. The mint addresses in
// shared/fixtures/mainnet/targets.json, chosen by address, remain the
// provenance; this check only stops a recognised name riding on wrong keys.
//
// The grades are the issuers' own published descriptions, not a legal
// opinion. Backed Finance issues xStocks as tracker certificates. Backpack
// Securities, a broker-dealer, describes each token as redeemable one to one
// for the underlying share (learn.backpack.exchange, "What Is Sunrise?").
var issuersByFreezeAuthority = map[string]issuerKeys{
	"JDq14BWvqCRFNu1krb12bcRpbGtJZ1FLEakMw6FdxJNs": {
		issuer:   Issuer{Name: "Backed Finance (xStocks)", Grade: GradeCertificate},
		delegate: "5aMNNLQJwAEeoemTEMkv5NVjqKwvvefRYCQ5Z67HFvEq",
		pause:    "JDq14BWvqCRFNu1krb12bcRpbGtJZ1FLEakMw6FdxJNs",
	},
	"2cVYpagTt7ZGc3mmTXBa7fAznUtx5DUu6aCq8uVDaf4a": {
		issuer:   Issuer{Name: "Backpack Securities", Grade: GradeEntitlement},
		delegate: "2cVYpagTt7ZGc3mmTXBa7fAznUtx5DUu6aCq8uVDaf4a",
		pause:    "2cVYpagTt7ZGc3mmTXBa7fAznUtx5DUu6aCq8uVDaf4a",
	},
}

type issuerKeys struct {
	issuer   Issuer
	delegate string
	pause    string
}

// RecognisedIssuer names the issuer whose keys this mint carries, or reports
// false, in which case the token is ungraded.
func (p Prerogatives) RecognisedIssuer() (Issuer, bool) {
	if p.FreezeAuthority == nil || p.PermanentDelegate == nil || p.Pausable == nil || p.Pausable.Authority == nil {
		return Issuer{}, false
	}
	keys, ok := issuersByFreezeAuthority[p.FreezeAuthority.String()]
	if !ok || p.PermanentDelegate.String() != keys.delegate || p.Pausable.Authority.String() != keys.pause {
		return Issuer{}, false
	}
	return keys.issuer, true
}

// Grade is the legal shape of the token, or ungraded when its issuer is not
// recognised.
func (p Prerogatives) Grade() string {
	if issuer, ok := p.RecognisedIssuer(); ok {
		return issuer.Grade
	}
	return GradeUngraded
}
