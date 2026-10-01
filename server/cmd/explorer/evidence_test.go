package main

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func TestWriteEvidencePagesPaginatesTheLongRegister(t *testing.T) {
	rows := make([]staleSurveyRow, evidenceRowsPerPage+1)
	for i := range rows {
		rows[i].Symbol = "LOT" + strconv.Itoa(i+1)
		rows[i].EffectiveAt = "2026-09-23T12:00:00Z"
	}
	base := page{Survey: &survey{Stale: rows}}
	dir := t.TempDir()

	if got := writeEvidencePages(dir, loadTemplates(), base); got != 2 {
		t.Fatalf("writeEvidencePages wrote %d pages, want 2", got)
	}

	first, err := os.ReadFile(filepath.Join(dir, "evidence.html"))
	if err != nil {
		t.Fatal(err)
	}
	second, err := os.ReadFile(filepath.Join(dir, "evidence-2.html"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(first), "LOT"+strconv.Itoa(evidenceRowsPerPage+1)) {
		t.Fatal("the first evidence page contains a row assigned to the second page")
	}
	if !strings.Contains(string(second), "LOT"+strconv.Itoa(evidenceRowsPerPage+1)) {
		t.Fatal("the second evidence page is missing its observation")
	}
	if !strings.Contains(string(first), `href="evidence-2.html"`) || !strings.Contains(string(second), `href="evidence.html"`) {
		t.Fatal("the evidence pages do not link to each other")
	}
}
