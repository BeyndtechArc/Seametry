// Package canonical implements the single canonical JSON form that every
// Seametry digest is computed over.
//
// The form is RFC 8785 (JCS) with one restriction: a JSON number must be an
// integer in the IEEE-754 safe range. Every fractional value and every
// magnitude beyond that range travels as a string, which is also how amounts
// travel (integer atoms plus an explicit scale).
//
// The restriction is not incidental. Every digest in the system passes through
// here, so this is the cheapest and most complete place to catch a float that
// reached a domain contract. See docs/ENGINEERING_STANDARD.md sections 3 and 8.
//
// This package is bound by spec/canonical/vectors.json, which also binds the
// browser side verifier in the Explorer and the Rust program. A vector is never
// edited to make this package pass.
package canonical

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

// The inclusive bounds within which every implementation can agree on an
// integer exactly. The bound is the IEEE-754 safe range rather than int64
// because JavaScript cannot represent int64 extremes, and a bound no browser
// side verifier could satisfy would not be a shared specification.
const (
	MaxSafeInteger = 1<<53 - 1    // 9007199254740991
	MinSafeInteger = -(1<<53 - 1) // -9007199254740991
)

// Marshal returns the canonical JSON encoding of v.
//
// Generic values (nil, bool, string, the integer kinds, json.Number,
// map[string]any, []any) are encoded directly. Anything else is routed through
// encoding/json first and then decoded with number fidelity preserved, so a
// struct carrying a float64 field is refused rather than silently rounded.
func Marshal(v any) ([]byte, error) {
	var buf bytes.Buffer
	if err := write(&buf, v, ""); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// Digest returns SHA-256 over the canonical encoding of v.
func Digest(v any) ([32]byte, error) {
	b, err := Marshal(v)
	if err != nil {
		return [32]byte{}, err
	}
	return sha256.Sum256(b), nil
}

// Decode parses JSON into generic values, preserving numbers as json.Number so
// that no integer is widened into a float on the way in. Always use this rather
// than encoding/json.Unmarshal when the result will be canonicalized.
func Decode(data []byte) (any, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		return nil, err
	}
	if dec.More() {
		return nil, fmt.Errorf("canonical: trailing content after top level value")
	}
	return v, nil
}

func write(buf *bytes.Buffer, v any, path string) error {
	switch t := v.(type) {
	case nil:
		buf.WriteString("null")
		return nil
	case bool:
		buf.WriteString(strconv.FormatBool(t))
		return nil
	case string:
		return writeString(buf, t, path)

	case json.Number:
		return writeNumberLiteral(buf, string(t), path)

	case int:
		return writeInt(buf, int64(t), path)
	case int8:
		return writeInt(buf, int64(t), path)
	case int16:
		return writeInt(buf, int64(t), path)
	case int32:
		return writeInt(buf, int64(t), path)
	case int64:
		return writeInt(buf, t, path)
	case uint:
		return writeUint(buf, uint64(t), path)
	case uint8:
		return writeUint(buf, uint64(t), path)
	case uint16:
		return writeUint(buf, uint64(t), path)
	case uint32:
		return writeUint(buf, uint64(t), path)
	case uint64:
		return writeUint(buf, t, path)

	case float32, float64:
		return fmt.Errorf("canonical: %s: floating point values are never canonical; "+
			"amounts are integer atoms plus an explicit scale", at(path))

	case map[string]any:
		return writeObject(buf, t, path)
	case []any:
		return writeArray(buf, t, path)
	}

	// Structs, named types, typed slices and maps: round-trip through
	// encoding/json so there is exactly one encoding of Go values, then
	// canonicalize the generic result. A float64 field becomes a JSON number
	// with a fractional part and is refused below, which is the point.
	raw, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("canonical: %s: %w", at(path), err)
	}
	generic, err := Decode(raw)
	if err != nil {
		return fmt.Errorf("canonical: %s: %w", at(path), err)
	}
	return write(buf, generic, path)
}

func writeInt(buf *bytes.Buffer, n int64, path string) error {
	if n > MaxSafeInteger || n < MinSafeInteger {
		return fmt.Errorf("canonical: %s: integer %d is outside the safe range; "+
			"values beyond %d travel as strings", at(path), n, MaxSafeInteger)
	}
	buf.WriteString(strconv.FormatInt(n, 10))
	return nil
}

func writeUint(buf *bytes.Buffer, n uint64, path string) error {
	if n > MaxSafeInteger {
		return fmt.Errorf("canonical: %s: integer %d is outside the safe range; "+
			"values beyond %d travel as strings", at(path), n, MaxSafeInteger)
	}
	buf.WriteString(strconv.FormatUint(n, 10))
	return nil
}

// writeNumberLiteral handles a number exactly as it appeared in JSON source,
// which is the only place an exponent or a fractional part can reach us.
func writeNumberLiteral(buf *bytes.Buffer, lit string, path string) error {
	if lit == "" {
		return fmt.Errorf("canonical: %s: empty number literal", at(path))
	}
	if !strings.ContainsAny(lit, ".eE") {
		n, err := strconv.ParseInt(lit, 10, 64)
		if err != nil {
			// Out of int64 range entirely, so certainly out of the safe range.
			return fmt.Errorf("canonical: %s: integer %s is outside the safe range; "+
				"values beyond %d travel as strings", at(path), lit, MaxSafeInteger)
		}
		return writeInt(buf, n, path)
	}

	f, err := strconv.ParseFloat(lit, 64)
	if err != nil {
		return fmt.Errorf("canonical: %s: malformed number %s", at(path), lit)
	}
	if math.IsInf(f, 0) || math.IsNaN(f) {
		return fmt.Errorf("canonical: %s: non-finite number %s", at(path), lit)
	}
	if f != math.Trunc(f) {
		return fmt.Errorf("canonical: %s: %s is not an integer; "+
			"amounts are integer atoms plus an explicit scale", at(path), lit)
	}
	if f > MaxSafeInteger || f < MinSafeInteger {
		return fmt.Errorf("canonical: %s: integer %s is outside the safe range; "+
			"values beyond %d travel as strings", at(path), lit, MaxSafeInteger)
	}
	return writeInt(buf, int64(f), path)
}

func writeObject(buf *bytes.Buffer, m map[string]any, path string) error {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	// JCS orders members by the UTF-16 code units of the key. This is not the
	// same as ordering by UTF-8 bytes: a key above U+FFFF encodes to a
	// surrogate pair beginning 0xD800, which sorts before U+E000..U+FFFF in
	// UTF-16 and after it in UTF-8. Sorting Go strings with < would take the
	// UTF-8 path and disagree with every JavaScript verifier.
	sort.Slice(keys, func(i, j int) bool { return lessUTF16(keys[i], keys[j]) })

	buf.WriteByte('{')
	for i, k := range keys {
		if i > 0 {
			buf.WriteByte(',')
		}
		if err := writeString(buf, k, path); err != nil {
			return err
		}
		buf.WriteByte(':')
		if err := write(buf, m[k], path+"."+k); err != nil {
			return err
		}
	}
	buf.WriteByte('}')
	return nil
}

func writeArray(buf *bytes.Buffer, a []any, path string) error {
	buf.WriteByte('[')
	for i, v := range a {
		if i > 0 {
			buf.WriteByte(',')
		}
		if err := write(buf, v, path+"["+strconv.Itoa(i)+"]"); err != nil {
			return err
		}
	}
	buf.WriteByte(']')
	return nil
}

func writeString(buf *bytes.Buffer, s string, path string) error {
	if !utf8.ValidString(s) {
		return fmt.Errorf("canonical: %s: string is not valid UTF-8", at(path))
	}
	buf.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"':
			buf.WriteString(`\"`)
		case '\\':
			buf.WriteString(`\\`)
		case '\b':
			buf.WriteString(`\b`)
		case '\f':
			buf.WriteString(`\f`)
		case '\n':
			buf.WriteString(`\n`)
		case '\r':
			buf.WriteString(`\r`)
		case '\t':
			buf.WriteString(`\t`)
		default:
			if r < 0x20 {
				// Lowercase hex, matching ECMAScript and therefore JCS.
				buf.WriteString(`\u`)
				const digits = "0123456789abcdef"
				buf.WriteByte('0')
				buf.WriteByte('0')
				buf.WriteByte(digits[(r>>4)&0xF])
				buf.WriteByte(digits[r&0xF])
			} else {
				buf.WriteRune(r)
			}
		}
	}
	buf.WriteByte('"')
	return nil
}

// lessUTF16 compares two strings by their UTF-16 code units, which is the
// ordering JCS specifies for object members.
func lessUTF16(a, b string) bool {
	if isASCII(a) && isASCII(b) {
		return a < b // identical orderings while both are ASCII
	}
	au := utf16.Encode([]rune(a))
	bu := utf16.Encode([]rune(b))
	for i := 0; i < len(au) && i < len(bu); i++ {
		if au[i] != bu[i] {
			return au[i] < bu[i]
		}
	}
	return len(au) < len(bu)
}

func isASCII(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] >= utf8.RuneSelf {
			return false
		}
	}
	return true
}

func at(path string) string {
	if path == "" {
		return "at top level"
	}
	return "at " + strings.TrimPrefix(path, ".")
}
