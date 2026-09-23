package receipt

import (
	"fmt"
	"strings"
	"sync"
	"time"
)

// Crockford base32 omits I, L, O and U: the first three because they are
// confused with 1 and 0 when read aloud or transcribed, and U so that no
// serial accidentally spells an obscenity.
const crockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

var crockfordIndex = func() map[byte]int {
	m := make(map[byte]int, len(crockford))
	for i := 0; i < len(crockford); i++ {
		m[crockford[i]] = i
	}
	return m
}()

// SerialBodyLength is the number of Crockford characters after the date part.
const SerialBodyLength = 7

// SerialLength is the total length: MMYY plus the body.
//
// Eleven characters is the maximum a London Bullion Market Association Good
// Delivery bar serial may carry, with the month and year leading exactly as
// those rules allow. The constraint is borrowed deliberately rather than
// invented.
const SerialLength = 4 + SerialBodyLength

// MaxSequence is the largest sequence a single month can allocate, which is
// 32^7 distinct values.
const MaxSequence = 1 << (5 * SerialBodyLength) // 34,359,738,368

// Serial identifies one receipt, permanently.
type Serial string

// FormatSerial renders MMYY plus the sequence in Crockford base32.
func FormatSerial(when time.Time, sequence uint64) (Serial, error) {
	if sequence >= MaxSequence {
		return "", fmt.Errorf("receipt: sequence %d exceeds what %d Crockford characters can carry (%d)",
			sequence, SerialBodyLength, uint64(MaxSequence))
	}
	utc := when.UTC()
	body := make([]byte, SerialBodyLength)
	for i := SerialBodyLength - 1; i >= 0; i-- {
		body[i] = crockford[sequence%32]
		sequence /= 32
	}
	return Serial(fmt.Sprintf("%02d%02d%s", utc.Month(), utc.Year()%100, body)), nil
}

// ParseSerial reads a serial back into its parts. It is strict: a serial is an
// identity, and a lenient parser turns a typo into a different receipt.
func ParseSerial(s Serial) (month time.Month, year int, sequence uint64, err error) {
	if len(s) != SerialLength {
		return 0, 0, 0, fmt.Errorf("receipt: serial %q is %d characters, want %d", s, len(s), SerialLength)
	}
	text := string(s)
	var mm, yy int
	if _, err := fmt.Sscanf(text[:4], "%02d%02d", &mm, &yy); err != nil {
		return 0, 0, 0, fmt.Errorf("receipt: serial %q has a malformed date part", s)
	}
	if mm < 1 || mm > 12 {
		return 0, 0, 0, fmt.Errorf("receipt: serial %q has month %d", s, mm)
	}
	for i := 4; i < len(text); i++ {
		digit, ok := crockfordIndex[text[i]]
		if !ok {
			return 0, 0, 0, fmt.Errorf("receipt: serial %q has a character outside Crockford base32 at position %d", s, i)
		}
		sequence = sequence*32 + uint64(digit)
	}
	return time.Month(mm), 2000 + yy, sequence, nil
}

// Allocator hands out serials in strictly increasing order within a month.
//
// Three properties are required of it and all three are tested: a serial is
// never reused, a serial is never skipped backwards, and allocation is safe
// under concurrent callers. In production the monotonic counter lives in
// Postgres under a unique constraint, and this type is the in process shape of
// the same contract.
type Allocator struct {
	mu       sync.Mutex
	period   string // MMYY of the current month
	sequence uint64
}

// NewAllocator starts an allocator. Pass the highest sequence already issued
// for the given month, or zero when the month is new, so that a restart
// continues rather than repeats.
func NewAllocator(when time.Time, alreadyIssued uint64) *Allocator {
	return &Allocator{period: periodOf(when), sequence: alreadyIssued}
}

func periodOf(when time.Time) string {
	utc := when.UTC()
	return fmt.Sprintf("%02d%02d", utc.Month(), utc.Year()%100)
}

// Next allocates the next serial for the month containing when.
//
// Crossing into a new month restarts the sequence, which is why the month is
// part of the serial: the pair is unique even though the sequence alone is not.
func (a *Allocator) Next(when time.Time) (Serial, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	if period := periodOf(when); period != a.period {
		a.period = period
		a.sequence = 0
	}
	a.sequence++
	return FormatSerial(when, a.sequence)
}

// Normalize applies Crockford's reading rules to a serial a human typed: case
// is insensitive, and I and L read as 1 while O reads as 0.
//
// Used only when accepting input from a person. It is never applied to a
// stored serial, because normalizing a stored value would mean two different
// stored serials could collapse into one.
func Normalize(input string) Serial {
	var b strings.Builder
	for _, r := range strings.ToUpper(strings.TrimSpace(input)) {
		switch r {
		case 'I', 'L':
			b.WriteByte('1')
		case 'O':
			b.WriteByte('0')
		case '-', ' ':
			// Separators a person may add for readability.
		default:
			b.WriteRune(r)
		}
	}
	return Serial(b.String())
}
