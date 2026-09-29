package main

import (
	"fmt"
	"math"
	"strings"
)

// pillarSVG draws the entrance pillar as a line engraving: one ink, tone made
// only by line weight, each hatch line one filled ribbon that swells and thins
// the way a burin cut does. It is served as a CSS mask, so its fill is
// irrelevant and the page chooses the ink from a design token.
//
// ink is "light" for the dark ground (lines are the light, so they thicken
// toward it) and "dark" for the paper of light mode (lines are ink, so they
// thicken into shadow). One weight map for both shaded the light version
// backwards when this was prototyped; that is why there are two.
//
// Drawn for a left pillar, lit from its right, which is the page's centre. The
// right pillar is the same file mirrored by CSS: the geometry is symmetric, so
// mirroring it also mirrors the light, which is exactly what the right pillar
// needs. The only light in the Hall is the content between the pillars.
//
// Floating point here is geometry, never an amount.
func pillarSVG(ink string) string {
	const w, h = 300.0, 1500.0
	const cx = w / 2
	// Eye height sits in the lower shaft, so mouldings above it bow upward and
	// those below bow downward, as a column's do when seen from the floor.
	const eye = 0.62

	light := norm3(0.75, -0.35, 0.56)
	lit := func(theta, ny float64) float64 {
		n := norm3(math.Sin(theta), ny, math.Cos(theta))
		return math.Max(0, n[0]*light[0]+n[1]*light[1]+n[2]*light[2])
	}
	weight := func(tone, max float64) float64 {
		if ink == "dark" {
			tone = 1 - tone
		}
		return max * math.Pow(tone, 1.2)
	}

	var out strings.Builder
	for _, p := range pillarParts {
		y0, y1 := p.a*h, p.b*h

		if p.kind == "shaft" {
			// Lines evenly spaced in angle, so they crowd toward the
			// silhouette: the engraver's way of turning a flat plate round.
			const flutes, perFlute = 16, 6
			n := flutes / 2 * perFlute
			for k := 0; k < n; k++ {
				u := (float64(k) + 0.5) / float64(n)
				theta0 := -math.Pi/2 + u*math.Pi
				frac := math.Mod(u*flutes/2, 1)
				theta := theta0 - 0.45*math.Sin(2*math.Pi*frac)
				lineWeight := 0.45 // the arris between two flutes: a constant hairline
				if k%perFlute != 0 {
					lineWeight = weight(lit(theta, 0), 1.9)
				}
				// Whether a shaft line is cut at all is decided once for the
				// whole line; the taper only shapes it. Thresholding the
				// tapered width left stray dashes partway down the shaft.
				if lineWeight <= 0.08 {
					continue
				}
				var pts [][3]float64
				for s := 0; s <= 30; s++ {
					y := y0 + (y1-y0)*float64(s)/30
					// Lines thin where the shaft meets necking and torus, the
					// way a burin enters and leaves the plate.
					taper := math.Min(1, math.Min(float64(s)/3, float64(30-s)/3))
					pts = append(pts, [3]float64{cx + math.Sin(theta0)*p.r((y-y0)/(y1-y0))*w, y, lineWeight * (0.35 + 0.65*taper)})
				}
				out.WriteString(ribbon(pts))
			}
			continue
		}

		lines := int(math.Max(3, math.Round((y1-y0)/4.5)))
		for i := 0; i < lines; i++ {
			t := (float64(i) + 0.5) / float64(lines)
			y := y0 + t*(y1-y0)
			r := p.r(t) * w
			bow := 0.0
			if p.kind != "block" {
				bow = 0.06 * r * sign(eye*h-y)
			}
			var pts [][3]float64
			for s := 0; s <= 40; s++ {
				nx := -0.995 + 1.99*float64(s)/40
				var tone float64
				switch {
				case p.kind == "block" && nx > 0.86:
					tone = 0.85 // the one lit edge of a square block
				case p.kind == "block":
					tone = 0.32
				default:
					tone = lit(math.Asin(nx), p.ny(t))
					if p.kind == "band" {
						tone *= 0.75
					}
				}
				pts = append(pts, [3]float64{cx + nx*r, y - bow*math.Sqrt(1-nx*nx), weight(tone, 2.3)})
			}
			out.WriteString(inked(pts))
		}
	}

	// One hairline around the silhouette, closing the form before it is hatched.
	for _, sgn := range []float64{-1, 1} {
		var d strings.Builder
		for _, p := range pillarParts {
			for s := 0; s <= 12; s++ {
				t := float64(s) / 12
				cmd := "L"
				if d.Len() == 0 {
					cmd = "M"
				}
				fmt.Fprintf(&d, "%s%.2f,%.2f", cmd, cx+sgn*p.r(t)*w, (p.a+(p.b-p.a)*t)*h)
			}
		}
		fmt.Fprintf(&out, `<path d="%s" fill="none" stroke="black" stroke-width="0.5"/>`, d.String())
	}

	return fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %g %g" preserveAspectRatio="xMidYMax meet">%s</svg>`, w, h, out.String())
}

type pillarPart struct {
	kind string
	a, b float64
	r    func(t float64) float64
	ny   func(t float64) float64
}

func flat(float64) float64 { return 0 }

// A Tuscan column top to bottom: abacus, echinus, necking, fluted shaft with
// entasis, torus, plinth, as fractions of height. Tuscan because acanthus
// leaves are below what a pillar this narrow can resolve.
var pillarParts = []pillarPart{
	{"block", 0, 0.035, func(float64) float64 { return 0.48 }, flat},
	{"round", 0.035, 0.085, func(t float64) float64 { return 0.46 - 0.1*math.Sin(t*math.Pi/2) }, func(t float64) float64 { return -0.6 * (1 - t) }},
	{"band", 0.085, 0.1, func(float64) float64 { return 0.355 }, flat},
	{"shaft", 0.1, 0.87, func(t float64) float64 { return 0.33 + 0.025*t + 0.012*math.Sin(t*math.Pi) }, flat},
	{"round", 0.87, 0.925, func(t float64) float64 { return 0.36 + 0.07*math.Sin(t*math.Pi) }, func(t float64) float64 { return -0.55 * math.Cos(t*math.Pi) }},
	{"block", 0.925, 1, func(float64) float64 { return 0.49 }, flat},
}

// ribbon turns a polyline of (x, y, width) into one filled outline: each point
// is offset half its width along the local normal, out one side, back the other.
func ribbon(pts [][3]float64) string {
	left := make([]string, len(pts))
	right := make([]string, len(pts))
	for i, p := range pts {
		a, b := pts[max(0, i-1)], pts[min(len(pts)-1, i+1)]
		length := math.Hypot(b[0]-a[0], b[1]-a[1])
		if length == 0 {
			length = 1
		}
		nx, ny, half := -(b[1]-a[1])/length, (b[0]-a[0])/length, p[2]/2
		left[i] = fmt.Sprintf("%.2f,%.2f", p[0]+nx*half, p[1]+ny*half)
		right[len(pts)-1-i] = fmt.Sprintf("%.2f,%.2f", p[0]-nx*half, p[1]-ny*half)
	}
	return `<path d="M` + strings.Join(left, "L") + "L" + strings.Join(right, "L") + `Z"/>`
}

// inked splits a line wherever it thins to nothing, so shadow is empty stone or
// paper rather than a hairline running through it.
func inked(pts [][3]float64) string {
	var out strings.Builder
	var run [][3]float64
	flush := func() {
		if len(run) > 1 {
			out.WriteString(ribbon(run))
		}
		run = nil
	}
	for _, p := range pts {
		if p[2] > 0.08 {
			run = append(run, p)
		} else {
			flush()
		}
	}
	flush()
	return out.String()
}

func norm3(x, y, z float64) [3]float64 {
	m := math.Sqrt(x*x + y*y + z*z)
	return [3]float64{x / m, y / m, z / m}
}

func sign(v float64) float64 {
	switch {
	case v > 0:
		return 1
	case v < 0:
		return -1
	}
	return 0
}
