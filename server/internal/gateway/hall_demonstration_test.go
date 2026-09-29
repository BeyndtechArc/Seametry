package gateway_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/BeyndtechArc/Seametry/server/internal/gateway"
	"github.com/BeyndtechArc/Seametry/server/internal/gateway/api"
)

func TestHallDemonstrationPublishesTheRecordedDevnetTranscript(t *testing.T) {
	server := gateway.NewServer(nil, nil)
	server.HallEvidenceDir = filepath.Join("..", "..", "..", "shared", "evidence", "hall-demo")
	httpServer := httptest.NewServer(gateway.NewHandler(server))
	t.Cleanup(httpServer.Close)

	resp, err := http.Get(httpServer.URL + "/v1/hall/demonstration?cluster=devnet")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var body struct {
		Data api.HallTranscript `json:"data"`
		Meta api.Meta           `json:"meta"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Data.Producer.Kind != api.HallProducerKindDevnet || body.Data.Producer.Cluster == nil || *body.Data.Producer.Cluster != "devnet" {
		t.Fatalf("producer = %#v", body.Data.Producer)
	}
	if len(body.Data.Scenarios) == 0 || len(body.Data.Scenarios[0].Steps) == 0 {
		t.Fatal("devnet transcript has no scenarios or steps")
	}
	if body.Data.Scenarios[0].Steps[0].State == nil || body.Data.Scenarios[0].Steps[0].State.Supply == "" {
		t.Fatal("first recorded state did not preserve its integer supply as a string")
	}
	if body.Meta.Completeness != api.Complete {
		t.Errorf("completeness = %q, want complete", body.Meta.Completeness)
	}
}
