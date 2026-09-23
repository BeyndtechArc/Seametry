package receipt

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/BeyndtechArc/Seametry/internal/canonical"
)

func sampleReceipt(t *testing.T, serial Serial) Receipt {
	t.Helper()
	salt, err := NewSalt()
	if err != nil {
		t.Fatal(err)
	}
	return Receipt{
		Serial: serial,
		Public: PublicBody{
			Serial: string(serial),
			Kind:   KindStrike,
			Month:  "2026-09",
			Basket: "Alloy No. 1",
			Constituents: []Constituent{{
				Ticker: "AAPLx",
				Mint:   "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
				Grade:  "certificate",
				IssuerCan: []string{
					"The issuer can freeze this where it sits.",
					"The issuer can take this back from any wallet.",
				},
			}},
			WeakestEvidence: "verified",
			SizeBand:        Band100To1000,
			Venues:          []string{"Hall"},
			PolicyVersion:   "policy-2026.09.3",
			Settlement:      "finalized",
			Office:          "Seametry Office, Port Harcourt",
		},
		Private: PrivateBody{
			Serial:         string(serial),
			Wallet:         "7pt9tkctJPK7PPNQJ77GKg8ZffSF6QxoMiCFYHxrtaCj",
			Signature:      "5j7s8K2pQ9vX3mN4bR6tY1wE8uI0oP5aS2dF7gH9jK3lM6nB4vC1xZ8qW5eR7tY2",
			ApprovedAtoms:  "412500000",
			SettledAtoms:   "412873211",
			FloorAtoms:     "408375000",
			Scale:          6,
			FeeAtoms:       "1237500",
			ApprovedAt:     time.Date(2026, 9, 23, 14, 30, 0, 0, time.UTC),
			SettledAt:      time.Date(2026, 9, 23, 14, 30, 11, 0, time.UTC),
			Slot:           449580424,
			ApprovalDigest: "9f2b7c1d4e6a8b0c2d4e6f8a0b2c4d6e8f0a2b4c6d8e0f2a4b6c8d0e2f4a6b8c",
			Salt:           salt,
		},
	}
}

func sampleBatch(t *testing.T, n int) *Batch {
	t.Helper()
	allocator := NewAllocator(time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC), 0)
	receipts := make([]Receipt, n)
	for i := range receipts {
		serial, err := allocator.Next(time.Date(2026, 9, 23, 0, 0, 0, 0, time.UTC))
		if err != nil {
			t.Fatal(err)
		}
		receipts[i] = sampleReceipt(t, serial)
	}
	batch, err := NewBatch(receipts)
	if err != nil {
		t.Fatal(err)
	}
	return batch
}

// The rule from decision D7, enforced by scanning rather than by trusting the
// struct definition. Every string that reaches a public artifact is checked
// against the private body's sensitive values, so a field added later that
// happens to carry one is caught here rather than in production.
func TestNoPublicArtifactCarriesPrivateValues(t *testing.T) {
	batch := sampleBatch(t, 5)

	for _, r := range batch.Receipts {
		proof, err := batch.Proof(r.Serial)
		if err != nil {
			t.Fatal(err)
		}

		// Everything a verifier receives, serialized exactly as it travels.
		artifacts := map[string]any{
			"public body": r.Public,
			"proof":       proof,
		}
		forbidden := map[string]string{
			"wallet address":        r.Private.Wallet,
			"transaction signature": r.Private.Signature,
			"approved amount":       r.Private.ApprovedAtoms,
			"settled amount":        r.Private.SettledAtoms,
			"floor amount":          r.Private.FloorAtoms,
			"fee amount":            r.Private.FeeAtoms,
			"salt":                  r.Private.Salt,
		}

		for name, artifact := range artifacts {
			encoded, err := json.Marshal(artifact)
			if err != nil {
				t.Fatal(err)
			}
			text := string(encoded)
			for label, value := range forbidden {
				if value == "" {
					continue
				}
				if strings.Contains(text, value) {
					t.Errorf("the %s carries the %s (%q). A public artifact that contains any of "+
						"these is not redacted, whatever else it omits.", name, label, value)
				}
			}
		}
	}
}

// A signature is the specific case worth naming, because it is the one that
// looks harmless. It is public on chain and resolves to the wallet and every
// amount, so including it undoes every other omission.
func TestSignatureIsNotRedactable(t *testing.T) {
	r := sampleReceipt(t, "09260000001")
	encoded, err := json.Marshal(r.Public)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), r.Private.Signature) {
		t.Fatal("the public body carries the transaction signature")
	}
	// And the public body must have no field that could hold one.
	var asMap map[string]any
	if err := json.Unmarshal(encoded, &asMap); err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{"signature", "wallet", "tx", "transaction", "amount", "atoms"} {
		for key := range asMap {
			if strings.Contains(strings.ToLower(key), forbidden) {
				t.Errorf("the public body has a field %q, which can hold a %s", key, forbidden)
			}
		}
	}
}

func TestSaltIsRequiredAndRandom(t *testing.T) {
	r := sampleReceipt(t, "09260000001")

	r.Private.Salt = ""
	if _, err := r.Leaf(); err == nil {
		t.Error("a private body with no salt must be refused")
	}
	r.Private.Salt = "abcd"
	if _, err := r.Leaf(); err == nil {
		t.Error("a private body with a short salt must be refused")
	}

	seen := make(map[string]struct{}, 500)
	for i := 0; i < 500; i++ {
		salt, err := NewSalt()
		if err != nil {
			t.Fatal(err)
		}
		if len(salt) != SaltLength*2 {
			t.Fatalf("salt is %d hex characters, want %d", len(salt), SaltLength*2)
		}
		if _, repeat := seen[salt]; repeat {
			t.Fatal("NewSalt repeated a value, which would defeat its purpose")
		}
		seen[salt] = struct{}{}
	}
}

// The salt is what stops an observer recovering the private body by guessing.
// Without it, two receipts with identical contents would produce an identical
// commitment, which is the observable symptom of the whole problem.
func TestIdenticalContentProducesDifferentCommitments(t *testing.T) {
	first := sampleReceipt(t, "09260000001")
	second := sampleReceipt(t, "09260000001")
	second.Private = first.Private
	salt, err := NewSalt()
	if err != nil {
		t.Fatal(err)
	}
	second.Private.Salt = salt

	a, err := first.PrivateCommitment()
	if err != nil {
		t.Fatal(err)
	}
	b, err := second.PrivateCommitment()
	if err != nil {
		t.Fatal(err)
	}
	if a == b {
		t.Fatal("two receipts with identical contents produced the same commitment; the salt is not reaching the digest")
	}
}

func TestProofVerifiesWithoutAnySeametryState(t *testing.T) {
	batch := sampleBatch(t, 9) // not a power of two, on purpose
	for _, r := range batch.Receipts {
		proof, err := batch.Proof(r.Serial)
		if err != nil {
			t.Fatal(err)
		}

		// Round trip through JSON, because this is how a browser receives it.
		encoded, err := json.Marshal(proof)
		if err != nil {
			t.Fatal(err)
		}
		var received Proof
		if err := json.Unmarshal(encoded, &received); err != nil {
			t.Fatal(err)
		}

		ok, err := received.Verify()
		if err != nil {
			t.Fatal(err)
		}
		if !ok {
			t.Errorf("%s did not verify", r.Serial)
		}
		if received.Root != batch.Root().String() {
			t.Errorf("%s: proof root does not match the batch root", r.Serial)
		}
	}
}

func TestTamperedPublicBodyFailsVerification(t *testing.T) {
	batch := sampleBatch(t, 4)
	proof, err := batch.Proof(batch.Receipts[1].Serial)
	if err != nil {
		t.Fatal(err)
	}

	for name, tamper := range map[string]func(*Proof){
		"grade":            func(p *Proof) { p.Public.Constituents[0].Grade = "entitlement" },
		"size band":        func(p *Proof) { p.Public.SizeBand = BandOver10000 },
		"policy version":   func(p *Proof) { p.Public.PolicyVersion = "policy-2026.09.4" },
		"issuer power":     func(p *Proof) { p.Public.Constituents[0].IssuerCan = nil },
		"weakest evidence": func(p *Proof) { p.Public.WeakestEvidence = "unverified" },
	} {
		t.Run(name, func(t *testing.T) {
			altered := *proof
			altered.Public.Constituents = append([]Constituent{}, proof.Public.Constituents...)
			altered.Public.Constituents[0].IssuerCan = append([]string{}, proof.Public.Constituents[0].IssuerCan...)
			tamper(&altered)

			ok, err := altered.Verify()
			if err != nil {
				t.Fatal(err)
			}
			if ok {
				t.Errorf("changing the %s still verified against the published root", name)
			}
		})
	}
}

func TestOwnerCanProveThePrivateBody(t *testing.T) {
	batch := sampleBatch(t, 3)
	r := batch.Receipts[0]
	proof, err := batch.Proof(r.Serial)
	if err != nil {
		t.Fatal(err)
	}

	ok, err := proof.VerifyPrivate(r.Private)
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Fatal("the owner could not prove their own private body")
	}

	// Revealing it with the wrong salt proves nothing, which is what stops
	// someone claiming a body they did not have.
	wrong := r.Private
	wrong.Salt, _ = NewSalt()
	ok, err = proof.VerifyPrivate(wrong)
	if err != nil {
		t.Fatal(err)
	}
	if ok {
		t.Fatal("a private body with a different salt verified")
	}

	// So does changing an amount.
	altered := r.Private
	altered.SettledAtoms = "999999999"
	ok, err = proof.VerifyPrivate(altered)
	if err != nil {
		t.Fatal(err)
	}
	if ok {
		t.Fatal("an altered private body verified")
	}
}

func TestBatchRefusesADuplicateSerial(t *testing.T) {
	a := sampleReceipt(t, "09260000001")
	b := sampleReceipt(t, "09260000001")
	if _, err := NewBatch([]Receipt{a, b}); err == nil {
		t.Fatal("a batch with a repeated serial was accepted; serials are never reused")
	}
}

func TestBodiesMustAgreeOnTheirSerial(t *testing.T) {
	r := sampleReceipt(t, "09260000001")
	r.Private.Serial = "09260000002"
	if _, err := r.Leaf(); err == nil {
		t.Fatal("bodies disagreeing about which receipt they belong to were accepted")
	}
}

func TestSerialFormat(t *testing.T) {
	when := time.Date(2026, 9, 23, 0, 0, 0, 0, time.UTC)
	for _, c := range []struct {
		sequence uint64
		want     Serial
	}{
		{1, "09260000001"},
		{31, "0926000000Z"},
		{32, "09260000010"},
		{33, "09260000011"},
	} {
		got, err := FormatSerial(when, c.sequence)
		if err != nil {
			t.Fatal(err)
		}
		if got != c.want {
			t.Errorf("sequence %d: want %s got %s", c.sequence, c.want, got)
		}
		if len(got) != SerialLength {
			t.Errorf("%s is %d characters, want %d", got, len(got), SerialLength)
		}
	}

	if _, err := FormatSerial(when, MaxSequence); err == nil {
		t.Error("a sequence beyond what seven characters can carry must be refused")
	}
}

func TestSerialRoundTrips(t *testing.T) {
	when := time.Date(2026, 9, 23, 0, 0, 0, 0, time.UTC)
	for _, sequence := range []uint64{1, 31, 32, 1023, 1024, 34359738367} {
		serial, err := FormatSerial(when, sequence)
		if err != nil {
			t.Fatal(err)
		}
		month, year, got, err := ParseSerial(serial)
		if err != nil {
			t.Fatalf("%s: %v", serial, err)
		}
		if month != time.September || year != 2026 || got != sequence {
			t.Errorf("%s parsed as %v %d seq %d, want September 2026 seq %d", serial, month, year, got, sequence)
		}
	}
}

func TestSerialParsingIsStrict(t *testing.T) {
	for _, bad := range []Serial{
		"", "0926000000", "092600000012", "13260000001", "00260000001",
		"0926000000I", "0926000000L", "0926000000O", "0926000000U", "0926-000-001",
	} {
		if _, _, _, err := ParseSerial(bad); err == nil {
			t.Errorf("accepted malformed serial %q; a lenient parser turns a typo into a different receipt", bad)
		}
	}
}

// Crockford's reading rules apply to what a person types, never to what is
// stored. Normalizing a stored serial would let two distinct stored values
// collapse into one.
func TestNormalizeAppliesCrockfordReadingRules(t *testing.T) {
	for input, want := range map[string]Serial{
		"0926000000i":   "09260000001",
		"0926-0000-00L": "09260000001",
		" 0926000000o ": "09260000000",
		"0926000000z":   "0926000000Z",
	} {
		if got := Normalize(input); got != want {
			t.Errorf("Normalize(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestAllocatorNeverRepeatsOrGoesBackwards(t *testing.T) {
	when := time.Date(2026, 9, 23, 0, 0, 0, 0, time.UTC)
	allocator := NewAllocator(when, 0)

	var previous uint64
	seen := make(map[Serial]struct{}, 1000)
	for i := 0; i < 1000; i++ {
		serial, err := allocator.Next(when)
		if err != nil {
			t.Fatal(err)
		}
		if _, repeat := seen[serial]; repeat {
			t.Fatalf("serial %s was issued twice", serial)
		}
		seen[serial] = struct{}{}

		_, _, sequence, err := ParseSerial(serial)
		if err != nil {
			t.Fatal(err)
		}
		if sequence <= previous {
			t.Fatalf("sequence went backwards: %d after %d", sequence, previous)
		}
		previous = sequence
	}
}

func TestAllocatorIsSafeUnderConcurrency(t *testing.T) {
	when := time.Date(2026, 9, 23, 0, 0, 0, 0, time.UTC)
	allocator := NewAllocator(when, 0)

	const workers, each = 8, 250
	results := make(chan Serial, workers*each)
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < each; j++ {
				serial, err := allocator.Next(when)
				if err != nil {
					t.Error(err)
					return
				}
				results <- serial
			}
		}()
	}
	wg.Wait()
	close(results)

	seen := make(map[Serial]struct{}, workers*each)
	for serial := range results {
		if _, repeat := seen[serial]; repeat {
			t.Fatalf("concurrent allocation issued %s twice", serial)
		}
		seen[serial] = struct{}{}
	}
	if len(seen) != workers*each {
		t.Fatalf("issued %d distinct serials, want %d", len(seen), workers*each)
	}
}

func TestAllocatorRestartsTheSequenceInANewMonth(t *testing.T) {
	september := time.Date(2026, 9, 30, 23, 59, 0, 0, time.UTC)
	october := time.Date(2026, 10, 1, 0, 0, 1, 0, time.UTC)

	allocator := NewAllocator(september, 0)
	first, err := allocator.Next(september)
	if err != nil {
		t.Fatal(err)
	}
	next, err := allocator.Next(october)
	if err != nil {
		t.Fatal(err)
	}

	if !strings.HasPrefix(string(first), "0926") {
		t.Errorf("September serial is %s", first)
	}
	if !strings.HasPrefix(string(next), "1026") {
		t.Errorf("October serial is %s", next)
	}
	// The sequence restarting is exactly why the month is part of the serial.
	_, _, sequence, err := ParseSerial(next)
	if err != nil {
		t.Fatal(err)
	}
	if sequence != 1 {
		t.Errorf("a new month restarts at 1, got %d", sequence)
	}
	if first == next {
		t.Error("serials collided across a month boundary")
	}
}

// A restart must continue from what was already issued rather than repeating.
func TestAllocatorResumesAfterRestart(t *testing.T) {
	when := time.Date(2026, 9, 23, 0, 0, 0, 0, time.UTC)
	first := NewAllocator(when, 0)
	var last Serial
	for i := 0; i < 10; i++ {
		s, err := first.Next(when)
		if err != nil {
			t.Fatal(err)
		}
		last = s
	}
	_, _, highest, err := ParseSerial(last)
	if err != nil {
		t.Fatal(err)
	}

	resumed := NewAllocator(when, highest)
	next, err := resumed.Next(when)
	if err != nil {
		t.Fatal(err)
	}
	_, _, sequence, err := ParseSerial(next)
	if err != nil {
		t.Fatal(err)
	}
	if sequence != highest+1 {
		t.Fatalf("after restart the next sequence was %d, want %d", sequence, highest+1)
	}
}

// Canonicalization is what makes a digest reproducible, so a body whose field
// order changed must still produce the same commitment.
func TestCommitmentDoesNotDependOnFieldOrder(t *testing.T) {
	r := sampleReceipt(t, "09260000001")
	first, err := canonical.Digest(r.Public)
	if err != nil {
		t.Fatal(err)
	}

	encoded, err := json.Marshal(r.Public)
	if err != nil {
		t.Fatal(err)
	}
	var reordered map[string]any
	if err := json.Unmarshal(encoded, &reordered); err != nil {
		t.Fatal(err)
	}
	second, err := canonical.Digest(reordered)
	if err != nil {
		t.Fatal(err)
	}
	if first != second {
		t.Fatalf("digest changed when the body passed through a map: %x vs %x", first, second)
	}
}

func TestBatchOfEveryPracticalSizeVerifies(t *testing.T) {
	for n := 1; n <= 40; n++ {
		batch := sampleBatch(t, n)
		root := batch.Root().String()
		for _, r := range batch.Receipts {
			proof, err := batch.Proof(r.Serial)
			if err != nil {
				t.Fatalf("n=%d: %v", n, err)
			}
			ok, err := proof.Verify()
			if err != nil {
				t.Fatalf("n=%d: %v", n, err)
			}
			if !ok {
				t.Fatalf("n=%d: %s did not verify", n, r.Serial)
			}
			if proof.Root != root {
				t.Fatalf("n=%d: %s proved against a different root", n, r.Serial)
			}
		}
	}
}

func TestProofForAnUnknownSerialIsRefused(t *testing.T) {
	batch := sampleBatch(t, 3)
	if _, err := batch.Proof(Serial("09269999999")); err == nil {
		t.Fatal("a proof was produced for a serial not in the batch")
	}
}

func ExampleProof_Verify() {
	// What a verifier does, with nothing from Seametry but the proof itself.
	proof := &Proof{}
	_ = proof
	fmt.Println("verification needs the proof and nothing else")
	// Output: verification needs the proof and nothing else
}
