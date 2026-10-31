package growth

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/BeyndtechArc/Seametry/server/internal/basket"
	"github.com/BeyndtechArc/Seametry/server/internal/solana"
	"github.com/BeyndtechArc/Seametry/server/internal/store/growthdb"
)

// HallChain is the RPC reads the Hall reader makes. *solana.Client
// satisfies it.
type HallChain interface {
	GetSignaturesForAddress(ctx context.Context, address, before string, limit int) ([]solana.SignatureInfo, error)
	GetTransaction(ctx context.Context, signature string) (*solana.Transaction, error)
}

// signaturePage is the most getSignaturesForAddress answers at once, and
// signaturePages bounds one pass: the devnet Hall's whole history was 39
// signatures on 30 October 2026, so a pass that reads 50,000 without
// meeting its cursor is reading something other than this program.
const (
	signaturePage  = 1000
	signaturePages = 50
)

// hallTypes names each Hall instruction (chain/programs/hall/src/lib.rs)
// in the register's words: create is a Strike, redeem a Melt, and
// withdraw delivers one melted leg.
var hallTypes = map[string]string{
	"initialize_alloy": "alloy.founded",
	"create":           "alloy.struck",
	"redeem":           "alloy.melted",
	"withdraw":         "leg.withdrawn",
	"sync":             "leg.synced",
}

// HallOrigin names a Hall program's history on one cluster, in each event
// read from it and in the cursor that resumes reading it.
func HallOrigin(cluster string) string { return "hall." + cluster }

// ReadHall reads the Hall program's transactions since the last one it
// read, oldest first, and writes one chain event per Hall instruction in
// each. A transaction's events and the cursor move together, so a pass
// stopped part way resumes at the next unread transaction. A signature the
// cluster cannot return yet ends the pass there; the next pass retries it.
//
// The wallet is the transaction's fee payer, the signer that paid for it;
// in every devnet Hall transaction read so far it was also the only
// signer. Only Hall instructions called directly are read: none of those
// transactions called the Hall from another program.
func (e *Events) ReadHall(ctx context.Context, chain HallChain, programID, cluster string, now time.Time) (written int, err error) {
	origin := HallOrigin(cluster)
	last := ""
	switch cursor, err := e.q.ChainCursor(ctx, origin); {
	case errors.Is(err, pgx.ErrNoRows):
	case err != nil:
		return 0, fmt.Errorf("growth: reading the %s cursor: %w", origin, err)
	default:
		last = cursor.LastSignature
	}
	unread, err := unreadSignatures(ctx, chain, programID, last)
	if err != nil {
		return 0, fmt.Errorf("growth: listing %s signatures after %q: %w", origin, last, err)
	}
	for i := len(unread) - 1; i >= 0; i-- {
		tx, err := chain.GetTransaction(ctx, unread[i].Signature)
		if err != nil {
			return written, fmt.Errorf("growth: reading %s transaction %s: %w", origin, unread[i].Signature, err)
		}
		if tx == nil {
			return written, nil
		}
		n, err := e.writeHallTransaction(ctx, tx, programID, cluster, now)
		written += n
		if err != nil {
			return written, err
		}
	}
	return written, nil
}

// unreadSignatures pages back from the newest signature until it meets the
// last one read, newest first. With no last one, it is the whole history.
func unreadSignatures(ctx context.Context, chain HallChain, programID, last string) ([]solana.SignatureInfo, error) {
	var unread []solana.SignatureInfo
	before := ""
	for range signaturePages {
		page, err := chain.GetSignaturesForAddress(ctx, programID, before, signaturePage)
		if err != nil {
			return nil, err
		}
		for _, info := range page {
			if info.Signature == last {
				return unread, nil
			}
			unread = append(unread, info)
		}
		if len(page) < signaturePage {
			if last != "" {
				return nil, fmt.Errorf("the history ended without the last signature read; the cursor names a transaction this program's history no longer returns")
			}
			return unread, nil
		}
		before = page[len(page)-1].Signature
	}
	return nil, fmt.Errorf("%d signatures were read without meeting the last one read", signaturePage*signaturePages)
}

func (e *Events) writeHallTransaction(ctx context.Context, tx *solana.Transaction, programID, cluster string, now time.Time) (written int, err error) {
	origin := HallOrigin(cluster)
	occurred := now
	if tx.BlockTime != nil {
		occurred = time.Unix(*tx.BlockTime, 0)
	}
	var failure any
	if len(tx.Err) > 0 && string(tx.Err) != "null" {
		failure = tx.Err
	}
	var rows []growthdb.InsertEventParams
	for index, instruction := range tx.Instructions {
		if instruction.ProgramID != programID {
			continue
		}
		name := basket.HallInstruction(instruction.Data)
		kind, known := hallTypes[name]
		if !known {
			kind = "hall.unrecognised"
		}
		properties := map[string]any{
			"signature": tx.Signature, "slot": tx.Slot, "instruction_index": index, "instruction": name,
			"network": cluster, "error": failure, "block_time_known": tx.BlockTime != nil,
		}
		for field, value := range hallArguments(name, instruction.Data) {
			properties[field] = value
		}
		encoded, err := json.Marshal(properties)
		if err != nil {
			return 0, fmt.Errorf("growth: encoding %s instruction %d of %s: %w", origin, index, tx.Signature, err)
		}
		rows = append(rows, growthdb.InsertEventParams{
			Type: kind, Wallet: pgtype.Text{String: tx.FeePayer, Valid: tx.FeePayer != ""}, Properties: encoded, Source: "chain",
			Origin: origin, OriginKey: tx.Signature + ":" + strconv.Itoa(index),
			OccurredAt: pgtype.Timestamptz{Time: occurred.UTC(), Valid: true},
		})
	}
	dbtx, err := e.db.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("growth: opening the %s transaction for %s: %w", origin, tx.Signature, err)
	}
	defer func() {
		if err != nil {
			_ = dbtx.Rollback(ctx)
		}
	}()
	q := e.q.WithTx(dbtx)
	for _, row := range rows {
		inserted, err := q.InsertEvent(ctx, row)
		if err != nil {
			return 0, fmt.Errorf("growth: writing %s from %s: %w", row.Type, row.OriginKey, err)
		}
		written += int(inserted)
	}
	if err = q.AdvanceChainCursor(ctx, growthdb.AdvanceChainCursorParams{
		Origin: origin, LastSignature: tx.Signature, LastSlot: int64(tx.Slot), AdvancedAt: pgtype.Timestamptz{Time: now.UTC(), Valid: true},
	}); err != nil {
		return 0, fmt.Errorf("growth: moving the %s cursor to %s: %w", origin, tx.Signature, err)
	}
	if err = dbtx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("growth: committing %s transaction %s: %w", origin, tx.Signature, err)
	}
	return written, nil
}

// hallArguments reads the integer arguments that follow an instruction's
// 8-byte name, little-endian as Anchor writes them, as decimal strings so
// no amount passes through a float. They are atoms of the share mint or of
// the leg's mint, whose scale is that mint's and is not read here. Data too
// short for its arguments answers none; the instruction is still recorded.
func hallArguments(name string, data []byte) map[string]string {
	u64 := func(at int) (string, bool) {
		if len(data) < at+8 {
			return "", false
		}
		return strconv.FormatUint(binary.LittleEndian.Uint64(data[at:at+8]), 10), true
	}
	switch name {
	case "create", "redeem":
		if shares, ok := u64(8); ok {
			return map[string]string{"share_atoms": shares}
		}
	case "withdraw":
		if units, ok := u64(9); ok {
			return map[string]string{"leg_index": strconv.Itoa(int(data[8])), "unit_atoms": units}
		}
	case "sync":
		if len(data) > 8 {
			return map[string]string{"leg_index": strconv.Itoa(int(data[8]))}
		}
	}
	return nil
}
