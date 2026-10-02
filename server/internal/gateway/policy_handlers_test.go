package gateway_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/BeyndtechArc/Seametry/server/internal/gateway/api"
	"github.com/BeyndtechArc/Seametry/server/internal/policy"
)

func TestGetPolicyServesTheDefaultDocument(t *testing.T) {
	srv := newTestServer(t)
	doc := policy.Default()
	resp, err := http.Get(srv.URL + "/v1/policies/" + doc.Version)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /v1/policies/%s = %d, want 200", doc.Version, resp.StatusCode)
	}
	var body struct {
		Data api.PolicyDocument `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Data.Version != doc.Version {
		t.Errorf("version = %q, want %q", body.Data.Version, doc.Version)
	}
	if body.Data.DepthCeilingBps != int(doc.DepthCeilingBps) {
		t.Errorf("depth_ceiling_bps = %d, want %d", body.Data.DepthCeilingBps, doc.DepthCeilingBps)
	}
	if body.Data.ImpactCeilingBps != int(doc.ImpactCeilingBps) {
		t.Errorf("impact_ceiling_bps = %d, want %d", body.Data.ImpactCeilingBps, doc.ImpactCeilingBps)
	}
}

func TestGetPolicyRefusesAnUnknownVersion(t *testing.T) {
	srv := newTestServer(t)
	resp, err := http.Get(srv.URL + "/v1/policies/policy-1970.01.1")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want 404: a version this process never issued is not the current one under a different name", resp.StatusCode)
	}
}

// everyReasonCode is server/internal/policy's own Code constants, named
// explicitly (not derived by reflection, which Go's const declarations do
// not support) so a code added there and never given a meaning here is a
// compile-time reminder the moment this list is updated to include it, not
// a silent gap a client discovers by asking for a code that is not there.
var everyReasonCode = []policy.Code{
	policy.CodeUngraded, policy.CodePaused, policy.CodeNonTransferable,
	policy.CodeFrozenByDefault, policy.CodeActiveHookUnknown, policy.CodeQuarantined,
	policy.CodeMultiplierUnresolved, policy.CodeNoRoute, policy.CodeNotTradable,
	policy.CodeRefusalUnknown, policy.CodeDepthAboveCeiling, policy.CodeImpactAboveCeiling, policy.CodeDepthNotObserved,
	policy.CodeUnknownExtension, policy.CodeHaltedByIssuer, policy.CodePermanentDelegate,
	policy.CodeFreezeAuthority, policy.CodePausable, policy.CodeHookCanBeEnabled,
	policy.CodeMultiplierAuthority, policy.CodeSupplyMutable, policy.CodeActivationPending,
	policy.CodeNaiveReaderWrong,
}

// TestListReasonCodesNamesEveryCode is docs/prd/API.md section 4.7: "a
// client must show a code it does not recognise, never map it to one it
// does." That only holds if this list actually has every code.
func TestListReasonCodesNamesEveryCode(t *testing.T) {
	srv := newTestServer(t)
	resp, err := http.Get(srv.URL + "/v1/reason-codes")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var body struct {
		Data []api.ReasonCodeEntry `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	got := make(map[string]string, len(body.Data))
	for _, e := range body.Data {
		if e.Meaning == "" {
			t.Errorf("code %s has an empty meaning", e.Code)
		}
		got[e.Code] = e.Meaning
	}
	for _, code := range everyReasonCode {
		if _, ok := got[string(code)]; !ok {
			t.Errorf("policy.%s (%q) has no entry in /v1/reason-codes", code, string(code))
		}
	}
	if len(got) != len(everyReasonCode) {
		t.Errorf("/v1/reason-codes lists %d codes, everyReasonCode names %d; one of the two has drifted", len(got), len(everyReasonCode))
	}
}
