package server_test

import (
	"os"
	"strings"
	"testing"
)

func TestComposeKeepsStatePrivateAndGivesTheServerItsRuntime(t *testing.T) {
	contents, err := os.ReadFile("deploy/compose.yaml")
	if err != nil {
		t.Fatalf("read deploy/compose.yaml: %v", err)
	}
	compose := string(contents)
	_, seametry, found := strings.Cut(compose, "\n  seametry:")
	if !found {
		t.Fatal("deploy/compose.yaml has no seametry service")
	}

	required := []string{
		"SEAMETRY_DATABASE_URL:",
		"SEAMETRY_OBJECT_STORE_DIR:",
		"/var/lib/seametry/objects",
		"restart: unless-stopped",
	}
	for _, value := range required {
		if !strings.Contains(seametry, value) {
			t.Errorf("deploy/compose.yaml does not contain %q", value)
		}
	}

	if strings.Contains(compose, `"5432:5432"`) {
		t.Error("deploy/compose.yaml publishes Postgres on the host; only the API edge belongs on a public port")
	}
	if strings.Contains(compose, "POSTGRES_PASSWORD: postgres") {
		t.Error("deploy/compose.yaml still carries the sample Postgres password")
	}
}

func TestDeploymentImageCarriesThePublishedDemoInputs(t *testing.T) {
	contents, err := os.ReadFile("deploy/Dockerfile")
	if err != nil {
		t.Fatalf("read deploy/Dockerfile: %v", err)
	}
	dockerfile := string(contents)
	for _, path := range []string{
		"shared/fixtures/mainnet",
		"shared/fixtures/jupiter",
		"shared/evidence/depth-2026-09-24.json",
		"shared/evidence/demo-batch",
	} {
		if !strings.Contains(dockerfile, path) {
			t.Errorf("deploy/Dockerfile does not carry %q; the deployed replay and demo commands cannot seed the API", path)
		}
	}
}
