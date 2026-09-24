package liquidity

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// Capture is one aggregator response stored exactly as received.
//
// Body is the response text, unmodified, and SHA256 is its digest. A capture
// whose body no longer hashes to its digest is refused on load, because an
// altered fixture is not evidence of anything.
type Capture struct {
	Symbol     string `json:"symbol"`
	Mint       string `json:"mint"`
	SizeUSDC   int64  `json:"size_usdc"`
	CapturedAt string `json:"captured_at"`
	Status     int    `json:"status"`
	SHA256     string `json:"sha256"`
	Body       string `json:"body"`
}

// NewCapture records an observation's response.
func NewCapture(symbol, mint string, sizeUSDC int64, o Observation) Capture {
	return Capture{
		Symbol: symbol, Mint: mint, SizeUSDC: sizeUSDC,
		CapturedAt: o.ReceivedAt.Format(time.RFC3339),
		Status:     o.Status, SHA256: o.RawSHA256, Body: string(o.Raw),
	}
}

func capturePath(dir, symbol string, sizeUSDC int64) string {
	return filepath.Join(dir, fmt.Sprintf("%s-%dusdc.json", symbol, sizeUSDC))
}

// WriteCapture stores a capture under dir.
func WriteCapture(dir string, c Capture) error {
	body, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(capturePath(dir, c.Symbol, c.SizeUSDC), append(body, '\n'), 0o644)
}

// LoadCapture reads one stored response and checks it against its digest.
func LoadCapture(dir, symbol string, sizeUSDC int64) (Capture, error) {
	path := capturePath(dir, symbol, sizeUSDC)
	raw, err := os.ReadFile(path)
	if err != nil {
		return Capture{}, fmt.Errorf("liquidity: %w (capture it with: go run ./tools/depth)", err)
	}
	var c Capture
	if err := json.Unmarshal(raw, &c); err != nil {
		return Capture{}, fmt.Errorf("liquidity: %s: %w", path, err)
	}
	sum := sha256.Sum256([]byte(c.Body))
	if got := hex.EncodeToString(sum[:]); got != c.SHA256 {
		return Capture{}, fmt.Errorf("liquidity: %s was altered since capture\n  recorded %s\n  actual   %s", path, c.SHA256, got)
	}
	return c, nil
}

// LoadCurve replays stored captures into a depth curve with no network.
//
// It is how a fixture becomes an observation: through the same Replay a live
// call uses, so replaying captured bytes reproduces exactly what the call would
// have produced.
func LoadCurve(dir, symbol, mint string, outputDecimals int32, sizesUSDC []int64, received time.Time) (Curve, error) {
	points := make([]Point, 0, len(sizesUSDC))
	for _, size := range sizesUSDC {
		capture, err := LoadCapture(dir, symbol, size)
		if err != nil {
			return Curve{}, err
		}
		in, err := WholeUSDC(size)
		if err != nil {
			return Curve{}, err
		}
		observation, err := Replay(Request{
			InputMint: USDCMint, OutputMint: mint,
			InputDecimals: USDCDecimals, OutputDecimals: outputDecimals, Amount: in,
		}, capture.Status, []byte(capture.Body), received, DefaultTTL)
		if err != nil {
			return Curve{}, fmt.Errorf("liquidity: %s at %d USDC: %w", symbol, size, err)
		}
		points = append(points, Point{Size: in, Observation: observation})
	}
	return BuildCurve(points)
}
