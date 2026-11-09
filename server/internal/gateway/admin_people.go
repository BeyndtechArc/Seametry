package gateway

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/BeyndtechArc/Seametry/server/internal/alert"
	"github.com/BeyndtechArc/Seametry/server/internal/execution"
	"github.com/BeyndtechArc/Seametry/server/internal/gateway/api"
	"github.com/BeyndtechArc/Seametry/server/internal/growth"
)

// AdminPeople is Growth's record of people as the Admin reads it.
// *growth.People satisfies it.
type AdminPeople interface {
	List(ctx context.Context, filter growth.PeopleFilter, after *growth.PersonCursor, limit int) (growth.PeoplePage, error)
	Read(ctx context.Context, id [16]byte, before time.Time, limit int) (growth.Person, error)
	Health(ctx context.Context, since time.Time) (growth.Health, error)
}

// WithAdminPeople gives the Admin Growth's people. Without them the people
// reads and System answer 503 to an admin.
func (s Server) WithAdminPeople(people AdminPeople) Server {
	s.AdminPeople = people
	return s
}

// AdminMail is the team's mail by delivery state. *alert.Mail satisfies it.
type AdminMail interface {
	Deliveries(ctx context.Context) ([]alert.DeliveryCount, error)
}

// WithAdminMail gives System the team's mail. Without it System answers 503
// to an admin.
func (s Server) WithAdminMail(mail AdminMail) Server {
	s.AdminMail = mail
	return s
}

// AdminEntriesWindow is how far back System totals site entries.
const AdminEntriesWindow = 7 * 24 * time.Hour

func peopleProblem(operation string, err error) (int, api.Problem) {
	var refused growth.Refused
	switch {
	case errors.As(err, &refused):
		return http.StatusBadRequest, gatewayProblem(http.StatusBadRequest, "Admin read refused", operation+": "+refused.Reason)
	case errors.Is(err, growth.ErrNoPerson):
		return http.StatusNotFound, gatewayProblem(http.StatusNotFound, "No such person", operation+": the record holds no person with this id; they may have been removed with their import batch.")
	default:
		return http.StatusInternalServerError, gatewayProblem(http.StatusInternalServerError, "People record unavailable", operation+": "+err.Error())
	}
}

func peopleUnconfigured(operation string) api.Problem {
	return gatewayProblem(http.StatusServiceUnavailable, "Admin unavailable", operation+" has no people record on this Gateway: it was started without one.")
}

// A people cursor is opaque to callers: base64url of the last row's change
// in Unix microseconds (Postgres's resolution, so the boundary row compares
// equal) and its id.
func encodePersonCursor(cursor growth.PersonCursor) string {
	return base64.RawURLEncoding.EncodeToString([]byte(fmt.Sprintf("p1|%d|%s", cursor.UpdatedAt.UnixMicro(), uuid.UUID(cursor.ID))))
}

func decodePersonCursor(encoded string) (growth.PersonCursor, error) {
	refused := growth.Refused{Reason: "cursor is not one this people list issued"}
	raw, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return growth.PersonCursor{}, refused
	}
	parts := strings.Split(string(raw), "|")
	if len(parts) != 3 || parts[0] != "p1" {
		return growth.PersonCursor{}, refused
	}
	micros, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil {
		return growth.PersonCursor{}, refused
	}
	id, err := uuid.Parse(parts[2])
	if err != nil {
		return growth.PersonCursor{}, refused
	}
	return growth.PersonCursor{UpdatedAt: time.UnixMicro(micros).UTC(), ID: id}, nil
}

func personSummary(person growth.PersonSummary) api.AdminPersonSummary {
	summary := api.AdminPersonSummary{
		Id: person.ID, Kind: api.AdminPersonSummaryKind(person.Kind), DisplayName: person.DisplayName, Stage: person.Stage,
		OutreachStatus: person.OutreachStatus, CreatedFrom: api.AdminPersonSummaryCreatedFrom(person.CreatedFrom),
		ImportedScore: person.ImportedScore, XHandle: person.XHandle, Wallets: person.Wallets, Verified: person.Verified,
		CreatedAt: person.CreatedAt, UpdatedAt: person.UpdatedAt,
	}
	if person.ImportedTier != "" {
		tier := person.ImportedTier
		summary.ImportedTier = &tier
	}
	return summary
}

// jsonObject decodes a stored JSON object for an answer. Numbers stay as
// their written text (json.Number), so an amount in an event is never
// passed through a float on its way to the reader.
func jsonObject(raw []byte) (map[string]interface{}, error) {
	object := map[string]interface{}{}
	if len(raw) == 0 {
		return object, nil
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := decoder.Decode(&object); err != nil {
		return nil, err
	}
	return object, nil
}

func (s Server) GetAdminPeople(ctx context.Context, request api.GetAdminPeopleRequestObject) (api.GetAdminPeopleResponseObject, error) {
	if s.AdminPeople == nil {
		return api.GetAdminPeopledefaultApplicationProblemPlusJSONResponse{Body: peopleUnconfigured("GetAdminPeople"), StatusCode: http.StatusServiceUnavailable}, nil
	}
	params := request.Params
	filter := growth.PeopleFilter{Tier: optional(params.Tier), Search: optional(params.Q)}
	if params.Stage != nil {
		filter.Stage = string(*params.Stage)
	}
	if params.OutreachStatus != nil {
		filter.OutreachStatus = string(*params.OutreachStatus)
	}
	if params.CreatedFrom != nil {
		filter.CreatedFrom = string(*params.CreatedFrom)
	}
	limit := 50
	if params.Limit != nil {
		limit = *params.Limit
	}
	var after *growth.PersonCursor
	if params.Cursor != nil {
		cursor, err := decodePersonCursor(*params.Cursor)
		if err != nil {
			status, problem := peopleProblem("GetAdminPeople", err)
			return api.GetAdminPeopledefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: status}, nil
		}
		after = &cursor
	}
	page, err := s.AdminPeople.List(ctx, filter, after, limit)
	if err != nil {
		status, problem := peopleProblem("GetAdminPeople", err)
		return api.GetAdminPeopledefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: status}, nil
	}
	data := api.AdminPeople{People: make([]api.AdminPersonSummary, 0, len(page.People)), Total: page.Total}
	for _, person := range page.People {
		data.People = append(data.People, personSummary(person))
	}
	data.Stages = make([]struct {
		People int64  `json:"people"`
		Stage  string `json:"stage"`
	}, len(page.Stages))
	for i, stage := range page.Stages {
		data.Stages[i].People, data.Stages[i].Stage = stage.People, stage.Stage
	}
	if page.Next != nil {
		next := encodePersonCursor(*page.Next)
		data.NextCursor = &next
	}
	return api.GetAdminPeople200JSONResponse{Data: data, Meta: s.adminMeta()}, nil
}

func (s Server) GetAdminPerson(ctx context.Context, request api.GetAdminPersonRequestObject) (api.GetAdminPersonResponseObject, error) {
	if s.AdminPeople == nil {
		return api.GetAdminPersondefaultApplicationProblemPlusJSONResponse{Body: peopleUnconfigured("GetAdminPerson"), StatusCode: http.StatusServiceUnavailable}, nil
	}
	before := s.Now().UTC()
	if request.Params.Before != nil {
		before = request.Params.Before.UTC()
	}
	limit := 50
	if request.Params.Limit != nil {
		limit = *request.Params.Limit
	}
	person, err := s.AdminPeople.Read(ctx, request.Id, before, limit)
	if err != nil {
		status, problem := peopleProblem("GetAdminPerson", err)
		return api.GetAdminPersondefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: status}, nil
	}
	data := api.AdminPerson{Person: personSummary(person.Summary), Timeline: make([]api.AdminTimelineEvent, 0, len(person.Timeline))}
	data.Identities = make([]struct {
		FirstSeenAt time.Time                           `json:"first_seen_at"`
		Kind        api.AdminPersonIdentitiesKind       `json:"kind"`
		LastSeenAt  time.Time                           `json:"last_seen_at"`
		Provenance  api.AdminPersonIdentitiesProvenance `json:"provenance"`
		Value       string                              `json:"value"`
		Verified    bool                                `json:"verified"`
	}, len(person.Identities))
	for i, identity := range person.Identities {
		data.Identities[i].FirstSeenAt, data.Identities[i].LastSeenAt = identity.FirstSeenAt, identity.LastSeenAt
		data.Identities[i].Kind, data.Identities[i].Provenance = api.AdminPersonIdentitiesKind(identity.Kind), api.AdminPersonIdentitiesProvenance(identity.Provenance)
		data.Identities[i].Value, data.Identities[i].Verified = identity.Value, identity.Verified
	}
	if imported := person.Imported; imported != nil {
		detail, err := jsonObject(imported.Detail)
		if err != nil {
			status, problem := peopleProblem("GetAdminPerson", fmt.Errorf("the import detail of this person is not a JSON object: %w", err))
			return api.GetAdminPersondefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: status}, nil
		}
		data.Imported = &api.AdminImported{
			Batch: imported.Batch, LawfulBasis: imported.LawfulBasis, LawfulBasisNote: imported.LawfulBasisNote, Tier: imported.Tier,
			Fit: imported.Fit, Signal: imported.Signal, Reach: imported.Reach, Engagement: imported.Engagement, Score: imported.Score, Detail: &detail,
		}
	}
	for _, event := range person.Timeline {
		properties, err := jsonObject(event.Properties)
		if err != nil {
			status, problem := peopleProblem("GetAdminPerson", fmt.Errorf("event %d's properties are not a JSON object: %w", event.ID, err))
			return api.GetAdminPersondefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: status}, nil
		}
		row := api.AdminTimelineEvent{Type: event.Type, Source: api.AdminTimelineEventSource(event.Source), Origin: event.Origin, OccurredAt: event.OccurredAt, Properties: properties}
		if event.Wallet != "" {
			wallet := event.Wallet
			row.Wallet = &wallet
		}
		if event.Deployment != "" {
			deployment := event.Deployment
			row.Deployment = &deployment
		}
		data.Timeline = append(data.Timeline, row)
	}
	return api.GetAdminPerson200JSONResponse{Data: data, Meta: s.adminMeta()}, nil
}

func (s Server) GetAdminSystem(ctx context.Context, _ api.GetAdminSystemRequestObject) (api.GetAdminSystemResponseObject, error) {
	if s.AdminRecord == nil {
		return api.GetAdminSystemdefaultApplicationProblemPlusJSONResponse{Body: adminUnconfigured("GetAdminSystem"), StatusCode: http.StatusServiceUnavailable}, nil
	}
	if s.AdminPeople == nil {
		return api.GetAdminSystemdefaultApplicationProblemPlusJSONResponse{Body: peopleUnconfigured("GetAdminSystem"), StatusCode: http.StatusServiceUnavailable}, nil
	}
	if s.AdminMail == nil {
		problem := gatewayProblem(http.StatusServiceUnavailable, "Admin unavailable", "GetAdminSystem has no mail record on this Gateway: it was started without one.")
		return api.GetAdminSystemdefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: http.StatusServiceUnavailable}, nil
	}
	motion, err := s.AdminRecord.Motion(ctx)
	if err != nil {
		status, problem := activityProblem("GetAdminSystem", err)
		return api.GetAdminSystemdefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: status}, nil
	}
	health, err := s.AdminPeople.Health(ctx, s.Now().UTC().Add(-AdminEntriesWindow))
	if err != nil {
		status, problem := peopleProblem("GetAdminSystem", err)
		return api.GetAdminSystemdefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: status}, nil
	}
	deliveries, err := s.AdminMail.Deliveries(ctx)
	if err != nil {
		problem := gatewayProblem(http.StatusInternalServerError, "Mail record unavailable", "GetAdminSystem: "+err.Error())
		return api.GetAdminSystemdefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: http.StatusInternalServerError}, nil
	}
	return api.GetAdminSystem200JSONResponse{Data: adminSystem(motion, health, deliveries), Meta: s.adminMeta()}, nil
}

func readerAges(readers []growth.CursorAge, slots bool) []api.AdminReaderAge {
	ages := make([]api.AdminReaderAge, len(readers))
	for i, reader := range readers {
		ages[i] = api.AdminReaderAge{Origin: reader.Origin, AdvancedAt: reader.AdvancedAt}
		if slots {
			slot := reader.LastSlot
			ages[i].LastSlot = &slot
		}
	}
	return ages
}

func adminSystem(motion execution.Motion, health growth.Health, deliveries []alert.DeliveryCount) api.AdminSystem {
	data := api.AdminSystem{
		LastReconciledAt: motion.LastReconciledAt, UnansweredLegs: motion.UnansweredLegs, OldestUnansweredAt: motion.OldestUnansweredAt,
		OutboxWrittenAt: motion.OutboxWrittenAt,
		Projections:     readerAges(health.Projections, false), ChainReaders: readerAges(health.ChainReaders, true),
		EntriesSince: dateOf(health.EntriesSince), Entries: health.Entries,
	}
	if health.NewestEntryOn != nil {
		newest := dateOf(*health.NewestEntryOn)
		data.NewestEntryOn = &newest
	}
	data.Events = make([]struct {
		Events           int64     `json:"events"`
		NewestOccurredAt time.Time `json:"newest_occurred_at"`
		NewestReceivedAt time.Time `json:"newest_received_at"`
		Source           string    `json:"source"`
	}, len(health.Sources))
	for i, source := range health.Sources {
		data.Events[i].Events, data.Events[i].Source = source.Events, source.Source
		data.Events[i].NewestOccurredAt, data.Events[i].NewestReceivedAt = source.NewestOccurredAt, source.NewestReceivedAt
	}
	data.People = make([]struct {
		CreatedFrom string `json:"created_from"`
		People      int64  `json:"people"`
	}, len(health.People))
	for i, origin := range health.People {
		data.People[i].CreatedFrom, data.People[i].People = origin.CreatedFrom, origin.People
	}
	data.Mail = make([]struct {
		Delivery          api.AdminSystemMailDelivery `json:"delivery"`
		Kind              api.AdminSystemMailKind     `json:"kind"`
		Mails             int64                       `json:"mails"`
		NewestAt          time.Time                   `json:"newest_at"`
		NewestDeliveredAt *time.Time                  `json:"newest_delivered_at,omitempty"`
	}, len(deliveries))
	for i, delivery := range deliveries {
		data.Mail[i].Kind, data.Mail[i].Delivery = api.AdminSystemMailKind(delivery.Kind), api.AdminSystemMailDelivery(delivery.Delivery)
		data.Mail[i].Mails, data.Mail[i].NewestAt, data.Mail[i].NewestDeliveredAt = delivery.Mails, delivery.NewestAt, delivery.NewestDeliveredAt
	}
	return data
}

func dateOf(day time.Time) openapi_types.Date {
	return openapi_types.Date{Time: day.UTC()}
}
