package alert

import (
	"bufio"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"math/big"
	"net"
	"net/mail"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

// session is what the fake server was told.
type session struct {
	mu       sync.Mutex
	auth     string
	from, to string
	data     string
}

func (s *session) snapshot() session {
	s.mu.Lock()
	defer s.mu.Unlock()
	return session{auth: s.auth, from: s.from, to: s.to, data: s.data}
}

// testCertificate is a self-signed certificate for 127.0.0.1, so the mailer
// verifies a real TLS handshake against a pool that trusts only it.
func testCertificate(t *testing.T) (tls.Certificate, *x509.CertPool) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	template := &x509.Certificate{
		SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "fake smtp"},
		NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour),
		IPAddresses: []net.IP{net.ParseIP("127.0.0.1")}, KeyUsage: x509.KeyUsageDigitalSignature,
		ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatal(err)
	}
	pool := x509.NewCertPool()
	pool.AddCert(parsed)
	return tls.Certificate{Certificate: [][]byte{der}, PrivateKey: key}, pool
}

// fakeSMTP answers one connection the way an SMTP server does, recording the
// login, envelope and message. It advertises AUTH and nothing else.
func fakeSMTP(t *testing.T, listener net.Listener) *session {
	t.Helper()
	got := &session{}
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		reader := bufio.NewReader(conn)
		write := func(line string) { conn.Write([]byte(line + "\r\n")) }
		write("220 fake ESMTP")
		for {
			line, err := reader.ReadString('\n')
			if err != nil {
				return
			}
			command := strings.TrimRight(line, "\r\n")
			upper := strings.ToUpper(command)
			got.mu.Lock()
			switch {
			case strings.HasPrefix(upper, "EHLO"):
				write("250-fake")
				write("250 AUTH PLAIN")
			case strings.HasPrefix(upper, "AUTH PLAIN"):
				decoded, _ := base64.StdEncoding.DecodeString(strings.TrimSpace(command[len("AUTH PLAIN"):]))
				got.auth = string(decoded)
				write("235 accepted")
			case strings.HasPrefix(upper, "MAIL FROM:"):
				got.from = command
				write("250 ok")
			case strings.HasPrefix(upper, "RCPT TO:"):
				got.to = command
				write("250 ok")
			case upper == "DATA":
				write("354 go on")
				var data strings.Builder
				for {
					part, err := reader.ReadString('\n')
					if err != nil || part == ".\r\n" {
						break
					}
					data.WriteString(part)
				}
				got.data = data.String()
				write("250 queued")
			case upper == "QUIT":
				write("221 bye")
				got.mu.Unlock()
				return
			default:
				write("502 unknown")
			}
			got.mu.Unlock()
		}
	}()
	return got
}

func port(t *testing.T, listener net.Listener) int {
	t.Helper()
	_, text, _ := net.SplitHostPort(listener.Addr().String())
	value, err := strconv.Atoi(text)
	if err != nil {
		t.Fatal(err)
	}
	return value
}

func TestAMessageIsSentUnderImplicitTLSWithItsLoginEnvelopeAndHeaders(t *testing.T) {
	certificate, pool := testCertificate(t)
	listener, err := tls.Listen("tcp", "127.0.0.1:0", &tls.Config{Certificates: []tls.Certificate{certificate}})
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	got := fakeSMTP(t, listener)
	mailer := &Mailer{
		Host: "127.0.0.1", Port: port(t, listener), ImplicitTLS: true, Username: "team@beyndtech.com", Password: "fixture-password",
		From: mail.Address{Name: "Seametry", Address: "seametry@beyndtech.com"}, To: mail.Address{Address: "team@beyndtech.com"},
		TLS: &tls.Config{ServerName: "127.0.0.1", RootCAs: pool, MinVersion: tls.VersionTLS12},
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	err = mailer.Send(ctx, Message{Subject: "Seametry feedback: Sell All stalled", ReplyTo: &mail.Address{Address: "holder@example.com"}, Body: "It stalled.\n.\nTwice."})
	if err != nil {
		t.Fatalf("sending: %v", err)
	}
	seen := got.snapshot()
	if seen.auth != "\x00team@beyndtech.com\x00fixture-password" {
		t.Fatalf("login: got %q", seen.auth)
	}
	if seen.from != "MAIL FROM:<seametry@beyndtech.com>" || seen.to != "RCPT TO:<team@beyndtech.com>" {
		t.Fatalf("envelope: got %q and %q", seen.from, seen.to)
	}
	for _, header := range []string{`From: "Seametry" <seametry@beyndtech.com>`, "To: <team@beyndtech.com>", "Reply-To: <holder@example.com>", "Subject: Seametry feedback: Sell All stalled", "Content-Type: text/plain; charset=\"utf-8\""} {
		if !strings.Contains(seen.data, header+"\r\n") {
			t.Errorf("message lacks header %q:\n%s", header, seen.data)
		}
	}
	// A line holding only a dot would end the message early unless stuffed.
	if !strings.Contains(seen.data, "Twice.") {
		t.Fatalf("the body was cut at its lone dot:\n%s", seen.data)
	}
}

func TestAServerWithoutTLSIsNeverSentThePassword(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	got := fakeSMTP(t, listener)
	mailer := &Mailer{
		Host: "127.0.0.1", Port: port(t, listener), Username: "team@beyndtech.com", Password: "fixture-password",
		From: mail.Address{Address: "seametry@beyndtech.com"}, To: mail.Address{Address: "team@beyndtech.com"},
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	err = mailer.Send(ctx, Message{Subject: "x", Body: "y"})
	if err == nil || !strings.Contains(err.Error(), "no STARTTLS") {
		t.Fatalf("got %v, want a refusal naming the missing STARTTLS", err)
	}
	if seen := got.snapshot(); seen.auth != "" {
		t.Fatalf("the password reached a server without TLS: %q", seen.auth)
	}
}

func TestAHeaderValueCannotAddHeaders(t *testing.T) {
	mailer := &Mailer{From: mail.Address{Address: "seametry@beyndtech.com"}, To: mail.Address{Address: "team@beyndtech.com"}}
	raw, err := mailer.compose(Message{Subject: "hello\r\nBcc: everyone@example.com", Body: "x"}, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "\r\nBcc:") {
		t.Fatalf("a subject added a header:\n%s", raw)
	}
}

func TestTheMailerIsConfiguredWhollyOrNotAtAll(t *testing.T) {
	env := func(values map[string]string) func(string) string {
		return func(name string) string { return values[name] }
	}
	if mailer, err := MailerFromEnv(env(nil)); mailer != nil || err != nil {
		t.Fatalf("no host: got %v %v, want nothing configured and no error", mailer, err)
	}
	if _, err := MailerFromEnv(env(map[string]string{"SEAMETRY_SMTP_HOST": "smtp.hostinger.com", "SEAMETRY_SMTP_PORT": "465"})); err == nil ||
		!strings.Contains(err.Error(), "SEAMETRY_SMTP_USERNAME") || !strings.Contains(err.Error(), "SEAMETRY_SMTP_PASSWORD") {
		t.Fatalf("partial configuration: got %v, want an error naming what is missing", err)
	}
	mailer, err := MailerFromEnv(env(map[string]string{
		"SEAMETRY_SMTP_HOST": "smtp.hostinger.com", "SEAMETRY_SMTP_PORT": "465", "SEAMETRY_SMTP_USERNAME": "team@beyndtech.com",
		"SEAMETRY_SMTP_PASSWORD": "fixture-password", "SEAMETRY_MAIL_FROM": "Seametry <seametry@beyndtech.com>", "SEAMETRY_ALERT_TO": "team@beyndtech.com",
	}))
	if err != nil || mailer == nil || !mailer.ImplicitTLS || mailer.From.Address != "seametry@beyndtech.com" {
		t.Fatalf("full configuration: got %+v %v", mailer, err)
	}
}
