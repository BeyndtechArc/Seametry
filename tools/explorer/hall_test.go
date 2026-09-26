package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestCommasWritesWholeUnitsWithSeparators(t *testing.T) {
	for _, c := range []struct {
		in   uint64
		want string
	}{
		{0, "0"}, {7, "7"}, {999, "999"}, {1000, "1,000"},
		{5003000, "5,003,000"}, {18446744073709551615, "18,446,744,073,709,551,615"},
	} {
		if got := commas(c.in); got != c.want {
			t.Errorf("commas(%d) = %q, want %q", c.in, got, c.want)
		}
	}
}

// The transcript is written by the Rust tests and read here, with nothing else
// linking the two. If the producer adds a field this page does not know, the
// page would drop it silently, so the decode refuses unknown fields.
func TestTranscriptDecodesWithoutDroppingAnyField(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "evidence", "hall-demo", "transcript.json"))
	if err != nil {
		t.Fatal(err)
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	var tr Transcript
	if err := dec.Decode(&tr); err != nil {
		t.Fatalf("the transcript has a shape this page does not read: %v", err)
	}

	if len(tr.Scenario) == 0 {
		t.Fatal("no scenarios decoded")
	}
	for _, s := range tr.Scenario {
		if s.Title == "" || s.Shows == "" || s.DoesNotShow == "" || len(s.Steps) == 0 {
			t.Errorf("scenario %q is missing a title, a claim, its limits or its steps", s.ID)
		}
		for _, m := range s.Steps {
			if m.Result != "ok" && m.Result != "refused" {
				t.Errorf("scenario %q: result %q is neither ok nor refused, and the page would show it as refused", s.ID, m.Result)
			}
			if m.Result == "refused" && m.Reason == "" {
				t.Errorf("scenario %q: a refusal with no reason", s.ID)
			}
		}
	}
	if tr.Producer.Kind == "" || tr.Producer.Description == "" {
		t.Error("the producer is not stated, so the page could not say what produced it")
	}
	if tr.Producer.Cluster == nil && tr.Producer.Signatures {
		t.Error("the transcript claims signatures but names no cluster")
	}
}
