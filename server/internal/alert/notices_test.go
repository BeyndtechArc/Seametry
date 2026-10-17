package alert

import (
	"context"
	"strings"
	"testing"
)

func TestOnlyLegsWorthALookBecomeANotice(t *testing.T) {
	routine := []Settlement{{Wallet: holder, Symbol: "NVDAx", Signature: "sig-a", Outcome: "landed"}}
	if _, _, worth := compose(routine); worth {
		t.Fatal("a routine landing produced a notice")
	}
	subject, body, worth := compose([]Settlement{
		{Wallet: holder, Symbol: "AMD", Signature: "sig-b", Outcome: "failed", ChainError: `{"InstructionError":[4,{"Custom":21}]}`},
		{Wallet: holder, Symbol: "BE", Signature: "sig-c", Outcome: "dropped"},
		{Wallet: holder, Symbol: "NVDAx", Signature: "sig-d", Outcome: "landed", FirstLandedForWallet: true},
		{Wallet: holder, Symbol: "PLTRx", Signature: "sig-e", Outcome: "landed"},
	})
	if !worth || subject != "Seametry: 2 legs did not land, 1 new wallet traded" {
		t.Fatalf("subject %q (worth %v)", subject, worth)
	}
	for _, line := range []string{"failed  AMD  wallet FFyr…N5DM", "https://solscan.io/tx/sig-b", `chain error: {"InstructionError":[4,{"Custom":21}]}`, "dropped  BE", "First landed trade for a wallet", "landed  NVDAx"} {
		if !strings.Contains(body, line) {
			t.Errorf("body lacks %q:\n%s", line, body)
		}
	}
	if strings.Contains(body, "PLTRx") {
		t.Errorf("a routine landing was listed:\n%s", body)
	}
}

func TestANoticeIsKeptThenMailed(t *testing.T) {
	pool := freshPool(t)
	mail := &heldMail{}
	notices := NewNotices(pool, mail)
	if err := notices.Settlements(context.Background(), []Settlement{{Wallet: holder, Symbol: "AMD", Signature: "sig-b", Outcome: "failed"}}); err != nil {
		t.Fatal(err)
	}
	if len(mail.sent) != 1 || mail.sent[0].Subject != "Seametry: 1 leg did not land" {
		t.Fatalf("mailed %+v", mail.sent)
	}
	var delivery, subject string
	if err := pool.QueryRow(context.Background(), "SELECT delivery, subject FROM alert.notices").Scan(&delivery, &subject); err != nil {
		t.Fatal(err)
	}
	if delivery != "delivered" || subject != "Seametry: 1 leg did not land" {
		t.Fatalf("kept %s %q", delivery, subject)
	}
	if err := notices.Settlements(context.Background(), []Settlement{{Wallet: holder, Signature: "sig-a", Outcome: "landed"}}); err != nil || len(mail.sent) != 1 {
		t.Fatalf("a pass with nothing worth a notice mailed or failed: %d sent, %v", len(mail.sent), err)
	}
}
