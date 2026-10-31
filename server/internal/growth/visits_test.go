package growth

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestVisitsAreCountedByDayPageAndCodeAndNothingElse(t *testing.T) {
	_, _, pool := fresh(t)
	visits := NewVisits(pool)
	ctx := context.Background()
	for _, visit := range []struct {
		at         time.Time
		path, code string
	}{
		{at, "/", ""}, {at.Add(time.Hour), "/", ""}, {at, "/", "x"}, {at, "/thesis", "dm-storm"}, {at, "/thesis", "dm"}, {at.AddDate(0, 0, 1), "/", ""},
	} {
		if err := visits.Count(ctx, visit.at, visit.path, visit.code); err != nil {
			t.Fatal(err)
		}
	}
	counts, err := visits.Counts(ctx, at, at)
	if err != nil {
		t.Fatal(err)
	}
	// A dm-<handle> names the person a message went to; it is counted as its channel.
	want := map[string]int64{"/|": 2, "/|x": 1, "/thesis|dm": 2}
	if len(counts) != len(want) {
		t.Fatalf("counts for %s: %+v; want %v", at.Format(time.DateOnly), counts, want)
	}
	for _, count := range counts {
		if want[count.LandingPath+"|"+count.RefCode] != count.Count {
			t.Errorf("%s with code %q counted %d, want %d", count.LandingPath, count.RefCode, count.Count, want[count.LandingPath+"|"+count.RefCode])
		}
	}
	var columns []string
	rows, err := pool.Query(ctx, "SELECT column_name FROM information_schema.columns WHERE table_schema = 'growth' AND table_name = 'visit_counts' ORDER BY column_name")
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var column string
		if err := rows.Scan(&column); err != nil {
			t.Fatal(err)
		}
		columns = append(columns, column)
	}
	if strings.Join(columns, ",") != "count,day,landing_path,ref_code" {
		t.Errorf("visit_counts holds %v; the privacy policy allows a day, a page, a code and a count, and nothing that tells visitors apart", columns)
	}
}

func TestAVisitOfTheWrongShapeIsRefusedWithoutEchoingIt(t *testing.T) {
	_, _, pool := fresh(t)
	visits := NewVisits(pool)
	for _, visit := range [][2]string{{"https://evil.example/", ""}, {"/a?email=someone@example.com", ""}, {"/", "Not A Code"}, {"/" + strings.Repeat("a", 200), ""}} {
		err := visits.Count(context.Background(), at, visit[0], visit[1])
		if err == nil {
			t.Errorf("path %q with code %q was counted", visit[0], visit[1])
			continue
		}
		if strings.Contains(err.Error(), visit[0]) || (visit[1] != "" && strings.Contains(err.Error(), visit[1])) {
			t.Errorf("the refusal %q repeats what the browser sent", err)
		}
	}
}
