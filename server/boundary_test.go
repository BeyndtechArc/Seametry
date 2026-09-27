// Package server_test holds tests that check the shape of the whole module
// rather than the behavior of one package, so it lives at the module root
// rather than inside any single service.
package server_test

import (
	"encoding/json"
	"os/exec"
	"strings"
	"testing"
)

type goListPackage struct {
	ImportPath string
	Imports    []string
}

// TestServiceBoundaries is what SERVICE_CATALOG.md means by "the boundaries
// in section 3 are enforced by package structure and tests, not by network
// hops": docs/prd/API.md section 10 names this test.
//
// The rule it checks is section 2's rule 1, "no service reads or writes
// another service's tables," read as narrowly as it is written: a service's
// storage layer will live at server/internal/<service>/store, and only that
// service's own package may import it. No store package exists yet, since
// API.md step A1 has not been built; this test is a guard rail waiting for
// something to guard, and the moment a service gains a store subpackage it
// is protected with no further test to write.
//
// It does not, and should not, forbid a service importing another service's
// exported package generally. internal/policy imports both internal/liquidity
// (liquidity.Curve, for DepthFromCurve) and internal/registry (registry.Mint,
// for FromRegistry) as plain input types to pure conversion functions:
// Policy never calls out to either service at runtime, it only accepts
// values they already produced, which is the in-process read rule 1 itself
// sanctions ("Access goes through the owning service's Go interface in
// process"). A test that flagged this would be wrong about what the rule
// says, not the code.
func TestServiceBoundaries(t *testing.T) {
	out, err := exec.Command("go", "list", "-json", "./internal/...").Output()
	if err != nil {
		t.Fatalf("go list -json ./internal/...: %v", err)
	}

	packages := map[string]goListPackage{}
	dec := json.NewDecoder(strings.NewReader(string(out)))
	for {
		var p goListPackage
		if err := dec.Decode(&p); err != nil {
			break
		}
		packages[p.ImportPath] = p
	}
	if len(packages) == 0 {
		t.Fatal("go list found no packages under internal/; the boundary could not be checked")
	}

	const modulePrefix = "github.com/BeyndtechArc/Seametry/server/internal/"
	for path, p := range packages {
		owner, _, _ := strings.Cut(strings.TrimPrefix(path, modulePrefix), "/")

		for _, imp := range p.Imports {
			if !strings.HasPrefix(imp, modulePrefix) {
				continue
			}
			parts := strings.Split(strings.TrimPrefix(imp, modulePrefix), "/")
			if len(parts) < 2 || parts[1] != "store" {
				continue
			}
			importedService := parts[0]
			if importedService != owner {
				t.Errorf("%s imports %s's store package (%s): a service's storage belongs to that service alone, per SERVICE_CATALOG.md section 2 rule 1",
					path, importedService, imp)
			}
		}
	}
}
