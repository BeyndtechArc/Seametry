// Package alert is the Alert service (docs/SERVICE_CATALOG.md section 3.8):
// delivery to the team's inbox. Today it delivers feedback a visitor sent;
// alerts on recorded activity reuse the same mailer once the reconciler can
// say what settled (.plan/activity-record-and-admin.plan.md).
package alert

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"errors"
	"fmt"
	"mime"
	"mime/quotedprintable"
	"net"
	"net/mail"
	"net/smtp"
	"strconv"
	"strings"
	"time"
)

// Mailer sends plain text mail over SMTP, always under TLS: implicit TLS
// when ImplicitTLS is set (port 465, Hostinger's measured default on 16
// October 2026), otherwise STARTTLS, and a server that offers neither is
// refused rather than sent a password in the clear.
type Mailer struct {
	Host        string
	Port        int
	ImplicitTLS bool
	Username    string
	Password    string
	From        mail.Address
	To          mail.Address
	// TLS overrides the default configuration, which verifies Host against
	// the system roots. Tests supply their own certificate pool.
	TLS *tls.Config
}

// MailerFromEnv reads the mailer's settings. It returns nil, and no error,
// when no host is set: feedback is then stored and marked not_configured.
// A partial configuration is an error naming what is missing, because it
// is a mistake, not a choice.
func MailerFromEnv(getenv func(string) string) (*Mailer, error) {
	host := strings.TrimSpace(getenv("SEAMETRY_SMTP_HOST"))
	if host == "" {
		return nil, nil
	}
	missing := []string{}
	value := func(name string) string {
		v := strings.TrimSpace(getenv(name))
		if v == "" {
			missing = append(missing, name)
		}
		return v
	}
	portText, username, password := value("SEAMETRY_SMTP_PORT"), value("SEAMETRY_SMTP_USERNAME"), getenv("SEAMETRY_SMTP_PASSWORD")
	if password == "" {
		missing = append(missing, "SEAMETRY_SMTP_PASSWORD")
	}
	fromText, toText := value("SEAMETRY_MAIL_FROM"), value("SEAMETRY_ALERT_TO")
	if len(missing) > 0 {
		return nil, fmt.Errorf("alert: SEAMETRY_SMTP_HOST is set but %s %s not", strings.Join(missing, ", "), map[bool]string{true: "is", false: "are"}[len(missing) == 1])
	}
	port, err := strconv.Atoi(portText)
	if err != nil || port < 1 || port > 65535 {
		return nil, fmt.Errorf("alert: SEAMETRY_SMTP_PORT %q is not a port number", portText)
	}
	from, err := mail.ParseAddress(fromText)
	if err != nil {
		return nil, fmt.Errorf("alert: SEAMETRY_MAIL_FROM %q is not an email address: %w", fromText, err)
	}
	to, err := mail.ParseAddress(toText)
	if err != nil {
		return nil, fmt.Errorf("alert: SEAMETRY_ALERT_TO %q is not an email address: %w", toText, err)
	}
	return &Mailer{Host: host, Port: port, ImplicitTLS: port == 465, Username: username, Password: password, From: *from, To: *to}, nil
}

// Message is one mail to the team. ReplyTo is optional and already checked
// to be an address.
type Message struct {
	Subject string
	ReplyTo *mail.Address
	Body    string
}

// headerValue removes what would end a header line: a value containing CR
// or LF could add headers of its own.
func headerValue(value string) string {
	return strings.NewReplacer("\r", " ", "\n", " ").Replace(value)
}

func (m *Mailer) compose(message Message, now time.Time) ([]byte, error) {
	id := make([]byte, 12)
	if _, err := rand.Read(id); err != nil {
		return nil, err
	}
	domain := m.From.Address[strings.LastIndex(m.From.Address, "@")+1:]
	var out bytes.Buffer
	header := func(name, value string) { fmt.Fprintf(&out, "%s: %s\r\n", name, headerValue(value)) }
	header("From", m.From.String())
	header("To", m.To.String())
	if message.ReplyTo != nil {
		header("Reply-To", message.ReplyTo.String())
	}
	header("Subject", mime.QEncoding.Encode("utf-8", message.Subject))
	header("Date", now.UTC().Format(time.RFC1123Z))
	header("Message-ID", "<"+hex.EncodeToString(id)+"@"+domain+">")
	header("MIME-Version", "1.0")
	header("Content-Type", `text/plain; charset="utf-8"`)
	header("Content-Transfer-Encoding", "quoted-printable")
	out.WriteString("\r\n")
	body := quotedprintable.NewWriter(&out)
	if _, err := body.Write([]byte(strings.ReplaceAll(message.Body, "\n", "\r\n"))); err != nil {
		return nil, err
	}
	if err := body.Close(); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

// Send delivers one message, within ctx's deadline.
func (m *Mailer) Send(ctx context.Context, message Message) error {
	raw, err := m.compose(message, time.Now())
	if err != nil {
		return fmt.Errorf("alert: composing the message: %w", err)
	}
	config := m.TLS
	if config == nil {
		config = &tls.Config{ServerName: m.Host, MinVersion: tls.VersionTLS12}
	}
	address := net.JoinHostPort(m.Host, strconv.Itoa(m.Port))
	dialer := &net.Dialer{}
	var conn net.Conn
	if m.ImplicitTLS {
		conn, err = (&tls.Dialer{NetDialer: dialer, Config: config}).DialContext(ctx, "tcp", address)
	} else {
		conn, err = dialer.DialContext(ctx, "tcp", address)
	}
	if err != nil {
		return fmt.Errorf("alert: connecting to %s: %w", address, err)
	}
	if deadline, ok := ctx.Deadline(); ok {
		_ = conn.SetDeadline(deadline)
	}
	client, err := smtp.NewClient(conn, m.Host)
	if err != nil {
		conn.Close()
		return fmt.Errorf("alert: greeting %s: %w", address, err)
	}
	defer client.Close()
	if !m.ImplicitTLS {
		if ok, _ := client.Extension("STARTTLS"); !ok {
			return errors.New("alert: " + address + " offers no STARTTLS, so the password was not sent; use port 465 for implicit TLS")
		}
		if err := client.StartTLS(config); err != nil {
			return fmt.Errorf("alert: starting TLS with %s: %w", address, err)
		}
	}
	if err := client.Auth(smtp.PlainAuth("", m.Username, m.Password, m.Host)); err != nil {
		return fmt.Errorf("alert: %s refused the login for %s: %w", address, m.Username, err)
	}
	if err := client.Mail(m.From.Address); err != nil {
		return fmt.Errorf("alert: %s refused the sender %s: %w", address, m.From.Address, err)
	}
	if err := client.Rcpt(m.To.Address); err != nil {
		return fmt.Errorf("alert: %s refused the recipient %s: %w", address, m.To.Address, err)
	}
	writer, err := client.Data()
	if err != nil {
		return fmt.Errorf("alert: %s refused the message: %w", address, err)
	}
	if _, err := writer.Write(raw); err != nil {
		return fmt.Errorf("alert: writing the message to %s: %w", address, err)
	}
	if err := writer.Close(); err != nil {
		return fmt.Errorf("alert: %s did not accept the message: %w", address, err)
	}
	return client.Quit()
}
