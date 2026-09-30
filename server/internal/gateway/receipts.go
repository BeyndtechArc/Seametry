package gateway

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/gateway/api"
	"github.com/BeyndtechArc/Seametry/server/internal/merkle"
	"github.com/BeyndtechArc/Seametry/server/internal/receipt"
)

// ReceiptLedger is what the Gateway reads of Receipt and Audit.
// *receipt.Ledger is one.
type ReceiptLedger interface {
	ProofOf(ctx context.Context, serial receipt.Serial) (*receipt.Proof, *receipt.Anchor, error)
	BatchOf(ctx context.Context, root string) ([]receipt.BatchLeaf, *receipt.Anchor, error)
	AnchorKeys(ctx context.Context) ([]receipt.AnchorKey, error)
}

// WithReceipts gives the Gateway the receipt ledger. Without it the three
// receipt operations answer 503 rather than claiming nothing was issued.
func (s Server) WithReceipts(ledger ReceiptLedger) Server {
	s.Receipts = ledger
	return s
}

func (s Server) receiptsUnavailable() *api.Problem {
	if s.Receipts != nil {
		return nil
	}
	problem := gatewayProblem(http.StatusServiceUnavailable, "Receipt ledger unavailable", "the Gateway has no receipt ledger configured")
	return &problem
}

func (s Server) GetReceipt(ctx context.Context, request api.GetReceiptRequestObject) (api.GetReceiptResponseObject, error) {
	if problem := s.receiptsUnavailable(); problem != nil {
		return api.GetReceiptdefaultApplicationProblemPlusJSONResponse{Body: *problem, StatusCode: problem.Status}, nil
	}
	serial := receipt.Serial(request.Serial)
	if _, _, _, err := receipt.ParseSerial(serial); err != nil {
		problem := gatewayProblem(http.StatusBadRequest, "Not a receipt serial", fmt.Sprintf("%q is not a receipt serial: %v", request.Serial, err))
		return api.GetReceiptdefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: problem.Status}, nil
	}
	proof, anchor, err := s.Receipts.ProofOf(ctx, serial)
	switch {
	case errors.Is(err, receipt.ErrNotIssued):
		problem := gatewayProblem(http.StatusNotFound, "Not found", fmt.Sprintf("No receipt carries serial %s.", serial))
		return api.GetReceiptdefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: problem.Status}, nil
	case errors.Is(err, receipt.ErrNotSealed):
		// Issued is not the same as provable: until its batch is sealed there
		// is no root, so no proof exists to serve. Saying so keeps a waiting
		// receipt distinguishable from one that was never issued.
		problem := gatewayProblem(http.StatusNotFound, "Not yet sealed", fmt.Sprintf("Receipt %s is issued but not yet sealed into a batch, so it has no inclusion proof yet.", serial))
		return api.GetReceiptdefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: problem.Status}, nil
	case err != nil:
		return nil, err
	}
	return api.GetReceipt200JSONResponse{Data: toAPIProof(*proof, anchor), Meta: anchorMeta(anchor)}, nil
}

func (s Server) GetBatch(ctx context.Context, request api.GetBatchRequestObject) (api.GetBatchResponseObject, error) {
	if problem := s.receiptsUnavailable(); problem != nil {
		return api.GetBatchdefaultApplicationProblemPlusJSONResponse{Body: *problem, StatusCode: problem.Status}, nil
	}
	root, err := merkle.ParseHash(request.Root)
	if err != nil {
		problem := gatewayProblem(http.StatusBadRequest, "Not a batch root", fmt.Sprintf("%q is not a batch root, which is 64 hex characters: %v", request.Root, err))
		return api.GetBatchdefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: problem.Status}, nil
	}
	leaves, anchor, err := s.Receipts.BatchOf(ctx, root.String())
	if errors.Is(err, receipt.ErrNotSealed) {
		problem := gatewayProblem(http.StatusNotFound, "Not found", fmt.Sprintf("No sealed batch has root %s.", root))
		return api.GetBatchdefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: problem.Status}, nil
	}
	if err != nil {
		return nil, err
	}
	batch := api.Batch{Root: root.String(), Anchor: toAPIAnchor(anchor)}
	batch.Leaves = make([]struct {
		PublicDigest string `json:"public_digest"`
		Serial       string `json:"serial"`
	}, len(leaves))
	for i, leaf := range leaves {
		batch.Leaves[i].Serial = string(leaf.Serial)
		batch.Leaves[i].PublicDigest = leaf.PublicDigest
	}
	return api.GetBatch200JSONResponse{Data: batch, Meta: anchorMeta(anchor)}, nil
}

// ListAnchorKeys is complete even when empty: no key published is the whole
// truth before the first anchor, not a gap in it.
func (s Server) ListAnchorKeys(ctx context.Context, request api.ListAnchorKeysRequestObject) (api.ListAnchorKeysResponseObject, error) {
	if problem := s.receiptsUnavailable(); problem != nil {
		return api.ListAnchorKeysdefaultApplicationProblemPlusJSONResponse{Body: *problem, StatusCode: problem.Status}, nil
	}
	keys, err := s.Receipts.AnchorKeys(ctx)
	if err != nil {
		return nil, err
	}
	data := make([]api.AnchorKey, len(keys))
	for i, k := range keys {
		data[i] = api.AnchorKey{Key: k.Key, ActiveFrom: k.ActiveFrom, ActiveTo: k.ActiveTo}
	}
	now := time.Now().UTC()
	return api.ListAnchorKeys200JSONResponse{Data: data, Meta: api.Meta{ServedAt: now, AsOf: now, Completeness: api.Complete}}, nil
}

// anchorMeta marks an unanchored batch partial: its proof verifies against
// the root, but nothing yet shows that root was published before today.
func anchorMeta(anchor *receipt.Anchor) api.Meta {
	now := time.Now().UTC()
	meta := api.Meta{ServedAt: now, AsOf: now, Completeness: api.Complete}
	if anchor == nil {
		meta.Completeness = api.Partial
		meta.Missing = &[]api.MissingPart{{Part: "anchor", State: api.MissingPartStateUnavailable, Reason: "BATCH_NOT_ANCHORED"}}
		return meta
	}
	// A cluster outside the enum stays in anchor.cluster as recorded rather
	// than being mapped onto one the envelope knows.
	if cluster := api.MetaCluster(anchor.Cluster); cluster == api.MetaClusterDevnet || cluster == api.MetaClusterMainnet {
		meta.Cluster = &cluster
	}
	return meta
}

func toAPIAnchor(anchor *receipt.Anchor) *struct {
	Cluster     *string `json:"cluster,omitempty"`
	Transaction *string `json:"transaction,omitempty"`
} {
	if anchor == nil {
		return nil
	}
	cluster, transaction := anchor.Cluster, anchor.Transaction
	return &struct {
		Cluster     *string `json:"cluster,omitempty"`
		Transaction *string `json:"transaction,omitempty"`
	}{Cluster: &cluster, Transaction: &transaction}
}

// toAPIProof copies every public field. A field dropped or reshaped here
// would change the digest a stranger recomputes from the served body, and
// the proof would stop verifying; receipts_test.go verifies the served JSON
// to catch exactly that.
func toAPIProof(p receipt.Proof, anchor *receipt.Anchor) api.Proof {
	public := api.ReceiptPublic{
		Serial:          p.Public.Serial,
		Kind:            string(p.Public.Kind),
		Month:           p.Public.Month,
		Basket:          p.Public.Basket,
		WeakestEvidence: p.Public.WeakestEvidence,
		SizeBand:        string(p.Public.SizeBand),
		// Always present, even when nil: the digest was taken over
		// "venues": null, and omitting the key would change it.
		Venues:        &p.Public.Venues,
		PolicyVersion: p.Public.PolicyVersion,
		Settlement:    p.Public.Settlement,
		Office:        p.Public.Office,
		SponsorMark:   p.Public.SponsorMark,
	}
	public.Constituents = make([]struct {
		Grade     string   `json:"grade"`
		IssuerCan []string `json:"issuer_can"`
		Mint      string   `json:"mint"`
		Ticker    string   `json:"ticker"`
	}, len(p.Public.Constituents))
	for i, c := range p.Public.Constituents {
		public.Constituents[i].Ticker = c.Ticker
		public.Constituents[i].Mint = c.Mint
		public.Constituents[i].Grade = c.Grade
		public.Constituents[i].IssuerCan = c.IssuerCan
	}
	path := make([]api.ProofStep, len(p.Path))
	for i, step := range p.Path {
		path[i] = api.ProofStep{Side: api.ProofStepSide(step.Side), Hash: step.Hash}
	}
	return api.Proof{
		Serial:            string(p.Serial),
		PublicBody:        public,
		PrivateCommitment: p.PrivateCommitment,
		Path:              path,
		Root:              p.Root,
		Anchor:            toAPIAnchor(anchor),
	}
}
