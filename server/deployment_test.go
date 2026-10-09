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
	for _, value := range []string{
		"auth-database:",
		"auth-migrate:",
		"AUTH_DATABASE_URL:",
		"SEAMETRY_AUTH_POSTGRES_PASSWORD:",
		"BETTER_AUTH_SECRET:",
		"GOOGLE_CLIENT_SECRET:",
	} {
		if !strings.Contains(compose, value) {
			t.Errorf("deploy/compose.yaml does not contain auth boundary %q", value)
		}
	}
}

func TestCaddyRoutesAccountsToTheDedicatedAuthority(t *testing.T) {
	contents, err := os.ReadFile("deploy/Caddyfile")
	if err != nil {
		t.Fatalf("read deploy/Caddyfile: %v", err)
	}
	caddyfile := string(contents)
	for _, route := range []string{"path /api/auth /api/auth/*", "path /api/account /api/account/*", "reverse_proxy auth:3005"} {
		if !strings.Contains(caddyfile, route) {
			t.Errorf("deploy/Caddyfile does not contain %q", route)
		}
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

func TestUpdateScriptOwnsTheRepeatableOracleDeploymentSequence(t *testing.T) {
	contents, err := os.ReadFile("deploy/update.sh")
	if err != nil {
		t.Fatalf("read deploy/update.sh: %v", err)
	}
	script := string(contents)
	for _, command := range []string{
		"git pull --ff-only origin main",
		"docker compose --env-file server/deploy/.env -f server/deploy/compose.yaml",
		"compose config --quiet",
		"compose up -d --build --remove-orphans",
		"compose up -d --force-recreate caddy",
		"/v1/status",
	} {
		if !strings.Contains(script, command) {
			t.Errorf("deploy/update.sh does not contain %q", command)
		}
	}
	if strings.Contains(script, "git reset --hard") {
		t.Error("deploy/update.sh may not discard changes on the host")
	}
}
