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

// GetSignatureStatus returns nil, not an error, for a signature the cluster
// has not seen: not yet landed is an answer, not a failure.
func (c *Client) GetSignatureStatus(ctx context.Context, signature string) (*SignatureStatus, error) {
	raw, err := c.Call(ctx, "getSignatureStatuses", []any{[]string{signature}, map[string]bool{"searchTransactionHistory": true}})
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
	if len(statuses) != 1 {
		return nil, fmt.Errorf("solana: getSignatureStatuses returned %d statuses for one signature", len(statuses))
	}
	return statuses[0], nil
}
