// Package solana reads chain state over JSON-RPC.
//
// Pacing, retry and cost accounting live in server/internal/transport. This package
// owns only what is specific to Solana: the request envelope, the node's own
// rate limit reply, and decoding accounts.
//
// Credit costs are not uniform. Helius charges one credit for an ordinary call
// and ten for getProgramAccounts, so a loop that looks cheap per second can be
// expensive per month. Each method is charged accordingly.
package solana

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/BeyndtechArc/Seametry/server/internal/base58"
	"github.com/BeyndtechArc/Seametry/server/internal/transport"
)

// MaxAccountsPerCall is the ceiling getMultipleAccounts accepts. Larger
// requests are chunked, because a caller usually holds a list rather than a
// batch.
const MaxAccountsPerCall = 100

// nodeRateLimited is the JSON-RPC code a node returns when it is behind or
// throttling. It is the one RPC error worth repeating.
const nodeRateLimited = -32005

var creditCost = map[string]float64{
	"getProgramAccounts": 10,
	"getAssetsByOwner":   10,
	"getAsset":           10,
	"searchAssets":       10,
}

func costOf(method string) float64 {
	if c, ok := creditCost[method]; ok {
		return c
	}
	return 1
}

// Options configure a Client. The zero value is usable.
type Options = transport.Options

// Client is a Solana JSON-RPC client, safe for concurrent use.
type Client struct {
	endpoint string
	http     *transport.Client
}

// New builds a client for an endpoint.
func New(endpoint string, opts Options) (*Client, error) {
	if endpoint == "" {
		return nil, fmt.Errorf("solana: endpoint is empty")
	}
	return &Client{endpoint: endpoint, http: transport.New(opts)}, nil
}

// Usage reports what this client has spent, in the provider's credits.
func (c *Client) Usage() transport.Usage { return c.http.Usage() }

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func (e *rpcError) Error() string { return fmt.Sprintf("rpc error %d: %s", e.Code, e.Message) }

type rpcResponse struct {
	Result json.RawMessage `json:"result"`
	Error  *rpcError       `json:"error"`
}

// Call makes one JSON-RPC request.
func (c *Client) Call(ctx context.Context, method string, params []any) (json.RawMessage, error) {
	payload, err := json.Marshal(map[string]any{
		"jsonrpc": "2.0", "id": 1, "method": method, "params": params,
	})
	if err != nil {
		return nil, fmt.Errorf("solana: %s: %w", method, err)
	}

	build := func() (*http.Request, error) {
		request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, bytes.NewReader(payload))
		if err != nil {
			return nil, err
		}
		request.Header.Set("content-type", "application/json")
		return request, nil
	}

	var result json.RawMessage
	check := func(body []byte) error {
		var parsed rpcResponse
		if err := json.Unmarshal(body, &parsed); err != nil {
			return &transport.PermanentError{Err: fmt.Errorf("malformed response: %w", err)}
		}
		if parsed.Error != nil {
			if parsed.Error.Code == nodeRateLimited {
				return &transport.RetryableError{Err: parsed.Error}
			}
			return &transport.PermanentError{Err: parsed.Error}
		}
		result = parsed.Result
		return nil
	}

	if _, err := c.http.Do(ctx, costOf(method), build, check); err != nil {
		return nil, fmt.Errorf("solana: %s: %w", method, err)
	}
	return result, nil
}

// Account is an account as the cluster returned it.
type Account struct {
	Address    string
	Owner      string
	Lamports   uint64
	Data       []byte
	Executable bool
}

type accountValue struct {
	Data       []string `json:"data"`
	Owner      string   `json:"owner"`
	Lamports   uint64   `json:"lamports"`
	Executable bool     `json:"executable"`
}

type contextResult struct {
	Context struct {
		Slot uint64 `json:"slot"`
	} `json:"context"`
	Value json.RawMessage `json:"value"`
}

// GetMultipleAccounts reads accounts, chunking at the RPC's own ceiling. A
// missing account comes back as a nil at its index rather than being dropped,
// so the result always lines up with the request. Dropping it would shift every
// later account onto the wrong address.
//
// The returned slot is the last chunk's. Ask for at most MaxAccountsPerCall
// when a single slot matters.
func (c *Client) GetMultipleAccounts(ctx context.Context, addresses []string, commitment string) (uint64, []*Account, error) {
	if commitment == "" {
		commitment = "finalized"
	}
	out := make([]*Account, 0, len(addresses))
	var slot uint64

	for start := 0; start < len(addresses); start += MaxAccountsPerCall {
		chunk := addresses[start:min(start+MaxAccountsPerCall, len(addresses))]

		raw, err := c.Call(ctx, "getMultipleAccounts", []any{chunk, map[string]string{
			"encoding": "base64", "commitment": commitment,
		}})
		if err != nil {
			return 0, nil, err
		}

		var result contextResult
		if err := json.Unmarshal(raw, &result); err != nil {
			return 0, nil, fmt.Errorf("solana: getMultipleAccounts: %w", err)
		}
		slot = result.Context.Slot

		var values []*accountValue
		if err := json.Unmarshal(result.Value, &values); err != nil {
			return 0, nil, fmt.Errorf("solana: getMultipleAccounts: %w", err)
		}
		if len(values) != len(chunk) {
			return 0, nil, fmt.Errorf("solana: asked for %d accounts, got %d", len(chunk), len(values))
		}

		for i, value := range values {
			account, err := decodeAccount(chunk[i], value)
			if err != nil {
				return 0, nil, err
			}
			out = append(out, account)
		}
	}
	return slot, out, nil
}

func decodeAccount(address string, value *accountValue) (*Account, error) {
	if value == nil || len(value.Data) == 0 {
		return nil, nil
	}
	data, err := base64.StdEncoding.DecodeString(value.Data[0])
	if err != nil {
		return nil, fmt.Errorf("solana: %s: %w", address, err)
	}
	return &Account{
		Address: address, Owner: value.Owner, Lamports: value.Lamports,
		Data: data, Executable: value.Executable,
	}, nil
}

// GetAccountInfo reads one account. It returns (nil, nil) when the account
// does not exist, the same "absent, not an error" shape decodeAccount
// already gives a missing entry inside GetMultipleAccounts.
func (c *Client) GetAccountInfo(ctx context.Context, address, commitment string) (*Account, error) {
	if commitment == "" {
		commitment = "finalized"
	}
	raw, err := c.Call(ctx, "getAccountInfo", []any{address, map[string]string{
		"encoding": "base64", "commitment": commitment,
	}})
	if err != nil {
		return nil, err
	}
	var result struct {
		Value *accountValue `json:"value"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("solana: getAccountInfo: %w", err)
	}
	return decodeAccount(address, result.Value)
}

// GetProgramAccounts lists every account a program owns whose data is
// exactly dataSize bytes. dataSize is the RPC's own filter, cheaper than
// fetching every account a program owns and discarding most of them, but
// it is not this package's only safety net: a caller decoding the result
// (basket.DecodeAlloy, for one) checks its own account discriminator
// too, so a same-sized account of a different type is still refused, not
// silently accepted.
//
// getProgramAccounts costs ten credits against the one credit an ordinary
// call costs (this file's own creditCost table), which is why it takes a
// size filter rather than returning everything a program owns.
func (c *Client) GetProgramAccounts(ctx context.Context, programID string, dataSize int, commitment string) ([]*Account, error) {
	if commitment == "" {
		commitment = "finalized"
	}
	raw, err := c.Call(ctx, "getProgramAccounts", []any{programID, map[string]any{
		"encoding": "base64", "commitment": commitment,
		"filters": []any{map[string]any{"dataSize": dataSize}},
	}})
	if err != nil {
		return nil, err
	}
	var entries []struct {
		Pubkey  string        `json:"pubkey"`
		Account *accountValue `json:"account"`
	}
	if err := json.Unmarshal(raw, &entries); err != nil {
		return nil, fmt.Errorf("solana: getProgramAccounts: %w", err)
	}
	out := make([]*Account, 0, len(entries))
	for _, e := range entries {
		account, err := decodeAccount(e.Pubkey, e.Account)
		if err != nil {
			return nil, err
		}
		if account != nil {
			out = append(out, account)
		}
	}
	return out, nil
}

// GetSlot returns the current slot at a commitment.
func (c *Client) GetSlot(ctx context.Context, commitment string) (uint64, error) {
	if commitment == "" {
		commitment = "finalized"
	}
	raw, err := c.Call(ctx, "getSlot", []any{map[string]string{"commitment": commitment}})
	if err != nil {
		return 0, err
	}
	var slot uint64
	if err := json.Unmarshal(raw, &slot); err != nil {
		return 0, fmt.Errorf("solana: getSlot: %w", err)
	}
	return slot, nil
}

// GetGenesisHash names the cluster behind the endpoint by its first block,
// which a URL cannot fake.
func (c *Client) GetGenesisHash(ctx context.Context) (string, error) {
	raw, err := c.Call(ctx, "getGenesisHash", nil)
	if err != nil {
		return "", err
	}
	var hash string
	if err := json.Unmarshal(raw, &hash); err != nil {
		return "", fmt.Errorf("solana: getGenesisHash: %w", err)
	}
	return hash, nil
}

// GetLatestBlockhash returns a blockhash to sign against, confirmed so the
// cluster still recognises it when the transaction lands.
func (c *Client) GetLatestBlockhash(ctx context.Context) ([32]byte, error) {
	raw, err := c.Call(ctx, "getLatestBlockhash", []any{map[string]string{"commitment": "confirmed"}})
	if err != nil {
		return [32]byte{}, err
	}
	var result contextResult
	var value struct {
		Blockhash string `json:"blockhash"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return [32]byte{}, fmt.Errorf("solana: getLatestBlockhash: %w", err)
	}
	if err := json.Unmarshal(result.Value, &value); err != nil {
		return [32]byte{}, fmt.Errorf("solana: getLatestBlockhash: %w", err)
	}
	hash, err := base58.Decode(value.Blockhash)
	if err != nil || len(hash) != 32 {
		return [32]byte{}, fmt.Errorf("solana: getLatestBlockhash returned %q, not a 32 byte hash (%v)", value.Blockhash, err)
	}
	return [32]byte(hash), nil
}

// SendTransaction submits a signed transaction and returns the signature the
// node reports. Preflight simulation stays on: a memo that would fail is
// refused before it costs a fee.
func (c *Client) SendTransaction(ctx context.Context, tx SignedTransaction) (string, error) {
	raw, err := c.Call(ctx, "sendTransaction", []any{
		base64.StdEncoding.EncodeToString(tx.Wire),
		map[string]string{"encoding": "base64", "preflightCommitment": "confirmed"},
	})
	if err != nil {
		return "", err
	}
	var signature string
	if err := json.Unmarshal(raw, &signature); err != nil {
		return "", fmt.Errorf("solana: sendTransaction: %w", err)
	}
	if signature != tx.ID() {
		return "", fmt.Errorf("solana: sendTransaction reported %s for a transaction signed as %s", signature, tx.ID())
	}
	return signature, nil
}

// SignatureStatus is where a submitted transaction stands. Err is the
// cluster's own error value, kept raw rather than interpreted.
type SignatureStatus struct {
	Slot               uint64          `json:"slot"`
	ConfirmationStatus string          `json:"confirmationStatus"`
	Err                json.RawMessage `json:"err"`
}

// MaxSignaturesPerCall is the ceiling getSignatureStatuses accepts.
const MaxSignaturesPerCall = 256

// GetSignatureStatus returns nil, not an error, for a signature the cluster
// has not seen: not yet landed is an answer, not a failure.
func (c *Client) GetSignatureStatus(ctx context.Context, signature string) (*SignatureStatus, error) {
	statuses, err := c.GetSignatureStatuses(ctx, []string{signature})
	if err != nil {
		return nil, err
	}
	return statuses[0], nil
}

// GetSignatureStatuses answers each signature at its own index, nil where the
// cluster has not seen it, chunking at the RPC's ceiling. History is searched,
// so a signature older than the node's recent cache is still found.
func (c *Client) GetSignatureStatuses(ctx context.Context, signatures []string) ([]*SignatureStatus, error) {
	out := make([]*SignatureStatus, 0, len(signatures))
	for start := 0; start < len(signatures); start += MaxSignaturesPerCall {
		chunk := signatures[start:min(start+MaxSignaturesPerCall, len(signatures))]
		raw, err := c.Call(ctx, "getSignatureStatuses", []any{chunk, map[string]bool{"searchTransactionHistory": true}})
		if err != nil {
			return nil, err
		}
		var result contextResult
		var statuses []*SignatureStatus
		if err := json.Unmarshal(raw, &result); err != nil {
			return nil, fmt.Errorf("solana: getSignatureStatuses: %w", err)
		}
		if err := json.Unmarshal(result.Value, &statuses); err != nil {
			return nil, fmt.Errorf("solana: getSignatureStatuses: %w", err)
		}
		if len(statuses) != len(chunk) {
			return nil, fmt.Errorf("solana: getSignatureStatuses returned %d statuses for %d signatures", len(statuses), len(chunk))
		}
		out = append(out, statuses...)
	}
	return out, nil
}

// GetBlockHeight returns the block height at a commitment, the measure a
// transaction's last valid block height is compared with.
func (c *Client) GetBlockHeight(ctx context.Context, commitment string) (uint64, error) {
	if commitment == "" {
		commitment = "confirmed"
	}
	raw, err := c.Call(ctx, "getBlockHeight", []any{map[string]string{"commitment": commitment}})
	if err != nil {
		return 0, err
	}
	var height uint64
	if err := json.Unmarshal(raw, &height); err != nil {
		return 0, fmt.Errorf("solana: getBlockHeight: %w", err)
	}
	return height, nil
}

// TokenBalance is one token account's balance before or after a transaction,
// as the cluster records it in the transaction's metadata.
type TokenBalance struct {
	Mint     string
	Owner    string
	Atoms    string
	Decimals int
}

// Transaction is what a settled transaction recorded: who paid, what it
// cost, whether it failed, and every token balance it touched.
type Transaction struct {
	Signature  string
	Slot       uint64
	BlockTime  *int64
	FeePayer   string
	Fee        uint64
	Err        json.RawMessage
	PreTokens  []TokenBalance
	PostTokens []TokenBalance
}

type parsedTokenBalance struct {
	Mint          string `json:"mint"`
	Owner         string `json:"owner"`
	UITokenAmount struct {
		Amount   string `json:"amount"`
		Decimals int    `json:"decimals"`
	} `json:"uiTokenAmount"`
}

func tokenBalances(parsed []parsedTokenBalance) []TokenBalance {
	out := make([]TokenBalance, 0, len(parsed))
	for _, b := range parsed {
		out = append(out, TokenBalance{Mint: b.Mint, Owner: b.Owner, Atoms: b.UITokenAmount.Amount, Decimals: b.UITokenAmount.Decimals})
	}
	return out
}

// GetTransaction returns nil, not an error, for a transaction the cluster
// cannot yet return: confirmed and not yet available is an answer.
func (c *Client) GetTransaction(ctx context.Context, signature string) (*Transaction, error) {
	raw, err := c.Call(ctx, "getTransaction", []any{signature, map[string]any{
		"encoding": "jsonParsed", "commitment": "confirmed", "maxSupportedTransactionVersion": 0,
	}})
	if err != nil {
		return nil, err
	}
	if string(raw) == "null" {
		return nil, nil
	}
	var parsed struct {
		Slot        uint64 `json:"slot"`
		BlockTime   *int64 `json:"blockTime"`
		Transaction struct {
			Signatures []string `json:"signatures"`
			Message    struct {
				AccountKeys []struct {
					Pubkey string `json:"pubkey"`
				} `json:"accountKeys"`
			} `json:"message"`
		} `json:"transaction"`
		Meta *struct {
			Err               json.RawMessage      `json:"err"`
			Fee               uint64               `json:"fee"`
			PreTokenBalances  []parsedTokenBalance `json:"preTokenBalances"`
			PostTokenBalances []parsedTokenBalance `json:"postTokenBalances"`
		} `json:"meta"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, fmt.Errorf("solana: getTransaction %s: %w", signature, err)
	}
	if parsed.Meta == nil || len(parsed.Transaction.Message.AccountKeys) == 0 || len(parsed.Transaction.Signatures) == 0 {
		return nil, fmt.Errorf("solana: getTransaction %s returned no metadata, account keys or signature", signature)
	}
	return &Transaction{
		Signature: parsed.Transaction.Signatures[0], Slot: parsed.Slot, BlockTime: parsed.BlockTime,
		FeePayer: parsed.Transaction.Message.AccountKeys[0].Pubkey, Fee: parsed.Meta.Fee, Err: parsed.Meta.Err,
		PreTokens: tokenBalances(parsed.Meta.PreTokenBalances), PostTokens: tokenBalances(parsed.Meta.PostTokenBalances),
	}, nil
}

// GetTransactionMessage returns a settled transaction's message bytes, the
// bytes its signatures and an approval's digest are computed over.
func (c *Client) GetTransactionMessage(ctx context.Context, signature string) ([]byte, error) {
	raw, err := c.Call(ctx, "getTransaction", []any{signature, map[string]any{
		"encoding": "base64", "commitment": "confirmed", "maxSupportedTransactionVersion": 0,
	}})
	if err != nil {
		return nil, err
	}
	var parsed struct {
		Transaction []string `json:"transaction"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil || len(parsed.Transaction) == 0 {
		return nil, fmt.Errorf("solana: getTransaction %s returned no base64 transaction (%v)", signature, err)
	}
	wire, err := base64.StdEncoding.DecodeString(parsed.Transaction[0])
	if err != nil {
		return nil, fmt.Errorf("solana: getTransaction %s: %w", signature, err)
	}
	// A transaction is a compact-u16 count of signatures, 64 bytes each, then the message.
	count, width := 0, 0
	for shift := 0; width < len(wire) && width < 3; shift += 7 {
		b := wire[width]
		count |= int(b&0x7f) << shift
		width++
		if b&0x80 == 0 {
			break
		}
	}
	start := width + count*64
	if count == 0 || start >= len(wire) {
		return nil, fmt.Errorf("solana: getTransaction %s is %d bytes, too short for %d signatures and a message", signature, len(wire), count)
	}
	return wire[start:], nil
}

// SignatureInfo is one entry in an address's transaction history.
type SignatureInfo struct {
	Signature string          `json:"signature"`
	Slot      uint64          `json:"slot"`
	BlockTime *int64          `json:"blockTime"`
	Err       json.RawMessage `json:"err"`
}

// GetSignaturesForAddress returns up to limit signatures touching address,
// newest first, continuing before the given signature when one is named.
func (c *Client) GetSignaturesForAddress(ctx context.Context, address, before string, limit int) ([]SignatureInfo, error) {
	options := map[string]any{"limit": limit, "commitment": "confirmed"}
	if before != "" {
		options["before"] = before
	}
	raw, err := c.Call(ctx, "getSignaturesForAddress", []any{address, options})
	if err != nil {
		return nil, err
	}
	var out []SignatureInfo
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("solana: getSignaturesForAddress: %w", err)
	}
	return out, nil
}

// GetTokenAccountsByOwnerAndMint returns the addresses of owner's token
// accounts for one mint.
func (c *Client) GetTokenAccountsByOwnerAndMint(ctx context.Context, owner, mint string) ([]string, error) {
	raw, err := c.Call(ctx, "getTokenAccountsByOwner", []any{owner, map[string]string{"mint": mint}, map[string]string{"encoding": "base64", "commitment": "confirmed"}})
	if err != nil {
		return nil, err
	}
	var result contextResult
	var accounts []struct {
		Pubkey string `json:"pubkey"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("solana: getTokenAccountsByOwner: %w", err)
	}
	if err := json.Unmarshal(result.Value, &accounts); err != nil {
		return nil, fmt.Errorf("solana: getTokenAccountsByOwner: %w", err)
	}
	out := make([]string, 0, len(accounts))
	for _, account := range accounts {
		out = append(out, account.Pubkey)
	}
	return out, nil
}
