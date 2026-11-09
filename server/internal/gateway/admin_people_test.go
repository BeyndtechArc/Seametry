package gateway_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/growth"
)

const personPath = "/v1/admin/people/5ea71e7a-0102-0304-0506-0708090a0b0c"

func TestAdminPeoplePassesItsFiltersAndPagesByAnOpaqueCursor(t *testing.T) {
	now := time.Date(2026, 10, 27, 12, 0, 0, 0, time.UTC)
	held := &heldAdmin{morePeople: &growth.PersonCursor{UpdatedAt: now.Add(-time.Hour), ID: personID}}
	handler, sign := adminHandler(t, "storm@example.com", held, now)
	token := sign(adminClaims{"storm@example.com", true})

	response := getActivity(handler, "/v1/admin/people?stage=lead&outreach_status=sent&created_from=import&tier=P1&q=ada&limit=1", token)
	if response.Code != http.StatusOK {
		t.Fatalf("people = %d: %s", response.Code, response.Body.String())
	}
	want := growth.PeopleFilter{Stage: "lead", OutreachStatus: "sent", CreatedFrom: "import", Tier: "P1", Search: "ada"}
	if held.filter != want || held.limit != 1 || held.peopleAfter != nil {
		t.Fatalf("filter %+v limit %d after %v, want %+v limit 1 and the first page", held.filter, held.limit, held.peopleAfter, want)
	}
	var body struct {
		Data struct {
			People []struct {
				ID           string `json:"id"`
				ImportedTier string `json:"imported_tier"`
				XHandle      string `json:"x_handle"`
			} `json:"people"`
			Total      int64   `json:"total"`
			NextCursor *string `json:"next_cursor"`
			Stages     []struct {
				Stage  string `json:"stage"`
				People int64  `json:"people"`
			} `json:"stages"`
		} `json:"data"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Data.People) != 1 || body.Data.People[0].ID != "5ea71e7a-0102-0304-0506-0708090a0b0c" || body.Data.People[0].ImportedTier != "P1" || body.Data.People[0].XHandle != "@ada" {
		t.Fatalf("people = %+v", body.Data.People)
	}
	if body.Data.Total != 3 || len(body.Data.Stages) != 1 || body.Data.Stages[0].People != 3 || body.Data.NextCursor == nil {
		t.Fatalf("total %d stages %+v next %v, want 3, lead 3 and a cursor", body.Data.Total, body.Data.Stages, body.Data.NextCursor)
	}

	held.morePeople = nil
	if response := getActivity(handler, "/v1/admin/people?cursor="+*body.Data.NextCursor, token); response.Code != http.StatusOK {
		t.Fatalf("the next page = %d: %s", response.Code, response.Body.String())
	}
	if held.peopleAfter == nil || !held.peopleAfter.UpdatedAt.Equal(now.Add(-time.Hour)) || held.peopleAfter.ID != personID {
		t.Fatalf("the cursor came back as %+v, want the last row of the page before", held.peopleAfter)
	}
}

func TestAdminPeopleRefusesAForgedCursorOrARefusedFilterNamingIt(t *testing.T) {
	now := time.Date(2026, 10, 27, 12, 0, 0, 0, time.UTC)
	held := &heldAdmin{}
	handler, sign := adminHandler(t, "storm@example.com", held, now)
	token := sign(adminClaims{"storm@example.com", true})

	for _, forged := range []string{"forged", "cDF8bm90LWEtbnVtYmVyfHg"} {
		response := getActivity(handler, "/v1/admin/people?cursor="+forged, token)
		if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "cursor is not one this people list issued") {
			t.Fatalf("cursor %q = %d %s, want a 400 naming the cursor", forged, response.Code, response.Body.String())
		}
	}
	if held.reads != 0 {
		t.Fatalf("a forged cursor cost %d reads", held.reads)
	}
	response := getActivity(handler, "/v1/admin/people?stage=advocate", token)
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "the double refuses advocates") {
		t.Fatalf("a refused filter = %d %s, want growth's reason in a 400", response.Code, response.Body.String())
	}
}

func TestAdminPersonKeepsEveryNumberAsWrittenAndAnswers404ForNoOne(t *testing.T) {
	now := time.Date(2026, 10, 27, 12, 0, 0, 0, time.UTC)
	held := &heldAdmin{}
	handler, sign := adminHandler(t, "storm@example.com", held, now)
	token := sign(adminClaims{"storm@example.com", true})

	response := getActivity(handler, personPath+"?limit=20", token)
	if response.Code != http.StatusOK {
		t.Fatalf("person = %d: %s", response.Code, response.Body.String())
	}
	if !held.before.Equal(now) || held.limit != 20 {
		t.Fatalf("read before %s limit %d, want now and 20", held.before, held.limit)
	}
	// A float64 would print this as 1.2345678901234568e+20.
	if !strings.Contains(response.Body.String(), `"usdc_atoms":123456789012345678901`) {
		t.Fatalf("an event's amount was not passed through as written: %s", response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"source":"chain"`) || !strings.Contains(response.Body.String(), `"provenance":"account_token"`) {
		t.Fatalf("whose word each row is was lost: %s", response.Body.String())
	}

	response = getActivity(handler, "/v1/admin/people/00000000-0000-0000-0000-000000000001", token)
	if response.Code != http.StatusNotFound || !strings.Contains(response.Body.String(), "No such person") {
		t.Fatalf("an unknown person = %d %s, want a 404 naming them missing", response.Code, response.Body.String())
	}
}

func TestAdminSystemJoinsTheRecordsMotionWithGrowthsAndCountsAWeekOfEntries(t *testing.T) {
	now := time.Date(2026, 10, 27, 12, 0, 0, 0, time.UTC)
	held := &heldAdmin{}
	handler, sign := adminHandler(t, "storm@example.com", held, now)
	response := getActivity(handler, "/v1/admin/system", sign(adminClaims{"storm@example.com", true}))
	if response.Code != http.StatusOK {
		t.Fatalf("system = %d: %s", response.Code, response.Body.String())
	}
	if !held.since.Equal(now.Add(-7 * 24 * time.Hour)) {
		t.Fatalf("entries counted from %s, want seven days before %s", held.since, now)
	}
	var body struct {
		Data struct {
			LastReconciledAt *time.Time `json:"last_reconciled_at"`
			UnansweredLegs   int64      `json:"unanswered_legs"`
			OutboxWrittenAt  *time.Time `json:"outbox_written_at"`
			ChainReaders     []struct {
				Origin   string `json:"origin"`
				LastSlot *int64 `json:"last_slot"`
			} `json:"chain_readers"`
			Projections []struct {
				LastSlot *int64 `json:"last_slot"`
			} `json:"projections"`
			EntriesSince string `json:"entries_since"`
			Entries      int64  `json:"entries"`
			Mail         []struct {
				Kind              string     `json:"kind"`
				Delivery          string     `json:"delivery"`
				Mails             int64      `json:"mails"`
				NewestDeliveredAt *time.Time `json:"newest_delivered_at"`
			} `json:"mail"`
		} `json:"data"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	data := body.Data
	if data.LastReconciledAt == nil || data.UnansweredLegs != 1 || data.OutboxWrittenAt != nil {
		t.Fatalf("motion = %+v, want a reconciler answer, one leg waiting and an outbox never written", data)
	}
	if len(data.ChainReaders) != 1 || data.ChainReaders[0].LastSlot == nil || *data.ChainReaders[0].LastSlot != 412 {
		t.Fatalf("chain readers = %+v, want hall.devnet at slot 412", data.ChainReaders)
	}
	if len(data.Projections) != 1 || data.Projections[0].LastSlot != nil {
		t.Fatalf("projections = %+v, want one with no slot", data.Projections)
	}
	if data.EntriesSince != "2026-10-20" || data.Entries != 12 {
		t.Fatalf("entries %d since %s, want 12 since 2026-10-20", data.Entries, data.EntriesSince)
	}
	if len(data.Mail) != 2 || data.Mail[0].Mails != 3 || data.Mail[0].NewestDeliveredAt == nil || data.Mail[1].Delivery != "failed" || data.Mail[1].NewestDeliveredAt != nil {
		t.Fatalf("mail = %+v, want 3 feedback delivered and 1 notice failed, never delivered", data.Mail)
	}
}
