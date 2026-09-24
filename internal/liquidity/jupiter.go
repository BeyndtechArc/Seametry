package liquidity

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/BeyndtechArc/Seametry/internal/amount"
	"github.com/BeyndtechArc/Seametry/internal/transport"
)

const (
	// DefaultBaseURL is Jupiter's swap API.
	DefaultBaseURL = "https://api.jup.ag/swap/v1"

	// DefaultTTL is how long a quote stays usable. Jupiter states no expiry, so
	// this is our own policy, chosen short because a route that was executable
	// moments ago may not be now. It belongs in policy data once there is a
	// policy document for it.
	DefaultTTL = 15 * time.Second

	// Measured on 24 September 2026 against a free key: the x-ratelimit-*
	// headers counted ten requests per window of roughly ten seconds, and a
	// burst was refused on its tenth request.
	//
	// A token bucket sends at most burst + rate*T requests in any interval T,
	// so staying inside the quota needs burst + rate*window <= quota, whichever
	// way the provider aligns its windows. Two tokens of burst and 0.7 a second
	// gives at most 9 in ten seconds. An earlier draft used 8 and 0.9, which
	// permits 17, and was refused in the first live run.
	measuredQuota  = 10
	measuredWindow = 10 * time.Second
	defaultRate    = 0.7
	defaultBurst   = 2
)

// Options configure a Client.
type Options struct {
	BaseURL   string
	APIKey    string
	TTL       time.Duration
	Transport transport.Options
}

// Client prices routes through Jupiter.
type Client struct {
	base   string
	key    string
	ttl    time.Duration
	clock  func() time.Time
	client *transport.Client
}

// New builds a client.
func New(opts Options) *Client {
	if opts.BaseURL == "" {
		opts.BaseURL = DefaultBaseURL
	}
	if opts.TTL == 0 {
		opts.TTL = DefaultTTL
	}
	if opts.Transport.RequestsPerSecond == 0 {
		opts.Transport.RequestsPerSecond = defaultRate
	}
	if opts.Transport.Burst == 0 {
		opts.Transport.Burst = defaultBurst
	}
	clock := opts.Transport.Clock
	if clock == nil {
		clock = time.Now
	}
	return &Client{
		base: opts.BaseURL, key: opts.APIKey, ttl: opts.TTL,
		clock: clock, client: transport.New(opts.Transport),
	}
}

// Usage reports what this client has spent.
func (c *Client) Usage() transport.Usage { return c.client.Usage() }

// Observe prices one request.
//
// It returns an error only for a real fault. A refusal that describes the
// instrument, such as no route or a token that will not trade, is returned as
// an Observation, because that is the answer.
func (c *Client) Observe(ctx context.Context, req Request) (Observation, error) {
	query := url.Values{
		"inputMint":   {req.InputMint},
		"outputMint":  {req.OutputMint},
		"amount":      {req.Amount.AtomsString()},
		"slippageBps": {strconv.Itoa(req.SlippageBps)},
	}
	build := func() (*http.Request, error) {
		r, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base+"/quote?"+query.Encode(), nil)
		if err != nil {
			return nil, err
		}
		if c.key != "" {
			r.Header.Set("x-api-key", c.key)
		}
		return r, nil
	}

	raw, err := c.client.Do(ctx, 1, build, nil)
	received := c.clock().UTC()

	if err == nil {
		return Replay(req, http.StatusOK, raw, received, c.ttl)
	}

	var status *transport.StatusError
	if errors.As(err, &status) && status.Code == http.StatusBadRequest {
		return Replay(req, status.Code, status.Body, received, c.ttl)
	}
	return Observation{}, fmt.Errorf("liquidity: %s for %s: %w", req.Amount, req.OutputMint, err)
}

// Replay turns a stored response into an observation, with no network.
//
// It is the only place a response becomes an observation, and Observe goes
// through it, so replaying captured bytes reproduces exactly what a live call
// would have produced. That is what makes a fixture evidence rather than a
// sample of what someone once expected the API to say.
func Replay(req Request, status int, raw []byte, received time.Time, ttl time.Duration) (Observation, error) {
	switch status {
	case http.StatusOK:
		return parseQuote(req, raw, received, ttl)
	case http.StatusBadRequest:
		return classifyRefusal(req, status, raw, received), nil
	}
	return Observation{}, fmt.Errorf("liquidity: HTTP %d is not a response this package interprets", status)
}

type quoteBody struct {
	InputMint            string  `json:"inputMint"`
	InAmount             string  `json:"inAmount"`
	OutputMint           string  `json:"outputMint"`
	OutAmount            string  `json:"outAmount"`
	OtherAmountThreshold string  `json:"otherAmountThreshold"`
	SlippageBps          int     `json:"slippageBps"`
	PriceImpactPct       *string `json:"priceImpactPct"`
	ContextSlot          uint64  `json:"contextSlot"`
	RoutePlan            []struct {
		Swap struct {
			AmmKey string `json:"ammKey"`
			Label  string `json:"label"`
		} `json:"swapInfo"`
		Percent int `json:"percent"`
	} `json:"routePlan"`
}

func parseQuote(req Request, raw []byte, received time.Time, ttl time.Duration) (Observation, error) {
	var body quoteBody
	if err := json.Unmarshal(raw, &body); err != nil {
		return Observation{}, fmt.Errorf("liquidity: malformed quote: %w", err)
	}

	in, err := amount.ParseAtoms(body.InAmount, req.InputDecimals)
	if err != nil {
		return Observation{}, fmt.Errorf("liquidity: inAmount: %w", err)
	}
	out, err := amount.ParseAtoms(body.OutAmount, req.OutputDecimals)
	if err != nil {
		return Observation{}, fmt.Errorf("liquidity: outAmount: %w", err)
	}
	minOut, err := amount.ParseAtoms(body.OtherAmountThreshold, req.OutputDecimals)
	if err != nil {
		return Observation{}, fmt.Errorf("liquidity: otherAmountThreshold: %w", err)
	}

	quote := &Quote{
		InputMint: body.InputMint, OutputMint: body.OutputMint,
		In: in, Out: out, MinOut: minOut,
		SlippageBps: body.SlippageBps, ContextSlot: body.ContextSlot,
		ReceivedAt: received, ExpiresAt: received.Add(ttl),
		RawSHA256: digest(raw),
	}
	for _, hop := range body.RoutePlan {
		quote.Hops = append(quote.Hops, Hop{Venue: hop.Swap.Label, Pool: hop.Swap.AmmKey, Percent: hop.Percent})
	}
	if body.PriceImpactPct != nil {
		bps, err := impactToBps(*body.PriceImpactPct)
		if err != nil {
			return Observation{}, err
		}
		quote.StatedImpactBps = &bps
	}

	return Observation{
		Request: req, Availability: Available, Quote: quote,
		ReceivedAt: received, Status: http.StatusOK, Raw: raw, RawSHA256: quote.RawSHA256,
	}, nil
}

// impactToBps converts Jupiter's priceImpactPct to basis points, rounding up.
//
// The field is a fraction, not a percent. That was measured rather than
// assumed: at 100,000 USDC into AAPLx the realised shortfall against a 1 USDC
// quote was 2.11 percent while priceImpactPct read 0.0205. Treating it as a
// percent would understate impact a hundredfold.
func impactToBps(fraction string) (int64, error) {
	value, err := amount.ParseDecimal(fraction)
	if err != nil {
		return 0, fmt.Errorf("liquidity: priceImpactPct: %w", err)
	}
	scaled, err := value.MulDiv(big.NewInt(10000), big.NewInt(1), amount.RoundCeil)
	if err != nil {
		return 0, err
	}
	whole, err := scaled.Rescale(0, amount.RoundCeil)
	if err != nil {
		return 0, err
	}
	if !whole.Atoms().IsInt64() {
		return 0, fmt.Errorf("liquidity: priceImpactPct %s is out of range", fraction)
	}
	return whole.Atoms().Int64(), nil
}

type refusalBody struct {
	Code string `json:"errorCode"`
}

func classifyRefusal(req Request, status int, raw []byte, received time.Time) Observation {
	var body refusalBody
	_ = json.Unmarshal(raw, &body)

	availability := Unrecognised
	switch body.Code {
	case codeNoRoutes:
		availability = NoRoute
	case codeNotTradable:
		availability = NotTradable
	}
	return Observation{
		Request: req, Availability: availability, Code: body.Code,
		ReceivedAt: received, Status: status, Raw: raw, RawSHA256: digest(raw),
	}
}
