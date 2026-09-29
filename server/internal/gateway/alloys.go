package gateway

import (
	"context"
	"encoding/hex"
	"fmt"
	"math/big"
	"net/http"
	"sort"
	"time"

	"github.com/BeyndtechArc/Seametry/server/internal/amount"
	"github.com/BeyndtechArc/Seametry/server/internal/basket"
	"github.com/BeyndtechArc/Seametry/server/internal/gateway/api"
	"github.com/BeyndtechArc/Seametry/server/internal/registry"
	"github.com/BeyndtechArc/Seametry/server/internal/solana"
)

// HallReader is the Solana read surface needed by the public Hall endpoints.
// The narrow interface keeps transport retry policy in solana.Client while
// allowing the Gateway tests to replay captured account bytes without a node.
type HallReader interface {
	GetAccountInfo(context.Context, string, string) (*solana.Account, error)
	GetProgramAccounts(context.Context, string, int, string) ([]*solana.Account, error)
	GetMultipleAccounts(context.Context, []string, string) (uint64, []*solana.Account, error)
}

type alloyView struct {
	chain *basket.ChainAlloy
	api   api.Alloy
	core  basket.Alloy
}

func (s Server) ListAlloys(ctx context.Context, request api.ListAlloysRequestObject) (api.ListAlloysResponseObject, error) {
	if problem := s.hallConfigured(); problem != nil {
		return api.ListAlloysdefaultApplicationProblemPlusJSONResponse{Body: *problem, StatusCode: problem.Status}, nil
	}
	if request.Params.Cluster != nil && string(*request.Params.Cluster) != s.HallCluster {
		problem := gatewayProblem(http.StatusBadRequest, "Cluster not available", fmt.Sprintf("cluster %q was requested, but this Gateway reads the Hall on %q", *request.Params.Cluster, s.HallCluster))
		return api.ListAlloysdefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: problem.Status}, nil
	}
	accounts, err := s.Hall.GetProgramAccounts(ctx, s.HallProgramID, basket.AlloyAccountSize, "finalized")
	if err != nil {
		problem := gatewayProblem(http.StatusBadGateway, "Hall read failed", fmt.Sprintf("listing Alloy accounts owned by %s: %v", s.HallProgramID, err))
		return api.ListAlloysdefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: problem.Status}, nil
	}
	sort.Slice(accounts, func(i, j int) bool { return accounts[i].Address < accounts[j].Address })

	data := make([]api.Alloy, 0, len(accounts))
	for _, account := range accounts {
		view, err := s.decodeAlloy(ctx, account)
		if err != nil {
			problem := gatewayProblem(http.StatusBadGateway, "Hall account could not be decoded", err.Error())
			return api.ListAlloysdefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: problem.Status}, nil
		}
		data = append(data, view.api)
	}
	now := s.now()
	return api.ListAlloys200JSONResponse{Data: data, Meta: s.hallMeta(now)}, nil
}

func (s Server) GetAlloy(ctx context.Context, request api.GetAlloyRequestObject) (api.GetAlloyResponseObject, error) {
	if request.Params.AsOf != nil {
		problem := gatewayProblem(http.StatusNotImplemented, "Historical Hall reads are not built", fmt.Sprintf("as_of %s cannot be answered from a live Solana account read; no persisted Hall history exists yet", request.Params.AsOf.UTC().Format(time.RFC3339Nano)))
		return api.GetAlloydefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: problem.Status}, nil
	}
	view, problem := s.getAlloy(ctx, request.Address)
	if problem != nil {
		return api.GetAlloydefaultApplicationProblemPlusJSONResponse{Body: *problem, StatusCode: problem.Status}, nil
	}
	now := s.now()
	return api.GetAlloy200JSONResponse{Data: view.api, Meta: s.hallMeta(now)}, nil
}

func (s Server) GetAlloyStrikeCost(ctx context.Context, request api.GetAlloyStrikeCostRequestObject) (api.GetAlloyStrikeCostResponseObject, error) {
	view, problem := s.getAlloy(ctx, request.Address)
	if problem != nil {
		return api.GetAlloyStrikeCostdefaultApplicationProblemPlusJSONResponse{Body: *problem, StatusCode: problem.Status}, nil
	}
	shares, problem := parseShares(request.Params.Shares)
	if problem != nil {
		return api.GetAlloyStrikeCostdefaultApplicationProblemPlusJSONResponse{Body: *problem, StatusCode: problem.Status}, nil
	}

	row := api.CostRow{Shares: shares.String(), Legs: make([]struct {
		Amount api.Amount  `json:"amount"`
		Kept   *api.Amount `json:"kept,omitempty"`
		Stock  string      `json:"stock"`
	}, len(view.core.Constituents))}
	for i, constituent := range view.core.Constituents {
		required, err := basket.RequiredIn(constituent, shares, view.core.Supply)
		if err != nil {
			problem := gatewayProblem(http.StatusUnprocessableEntity, "Strike cost unavailable", err.Error())
			return api.GetAlloyStrikeCostdefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: problem.Status}, nil
		}
		row.Legs[i].Stock = constituent.Mint
		row.Legs[i].Amount = wireAmount(required)
	}
	now := s.now()
	return api.GetAlloyStrikeCost200JSONResponse{Data: row, Meta: s.hallMeta(now)}, nil
}

func (s Server) GetAlloyMeltProceeds(ctx context.Context, request api.GetAlloyMeltProceedsRequestObject) (api.GetAlloyMeltProceedsResponseObject, error) {
	view, problem := s.getAlloy(ctx, request.Address)
	if problem != nil {
		return api.GetAlloyMeltProceedsdefaultApplicationProblemPlusJSONResponse{Body: *problem, StatusCode: problem.Status}, nil
	}
	shares, problem := parseShares(request.Params.Shares)
	if problem != nil {
		return api.GetAlloyMeltProceedsdefaultApplicationProblemPlusJSONResponse{Body: *problem, StatusCode: problem.Status}, nil
	}
	if shares.Cmp(view.core.Supply) > 0 {
		problem := gatewayProblem(http.StatusUnprocessableEntity, "Melt proceeds unavailable", fmt.Sprintf("shares %s exceeds this Alloy's supply of %s", shares, view.core.Supply))
		return api.GetAlloyMeltProceedsdefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: problem.Status}, nil
	}

	row := api.CostRow{Shares: shares.String(), Legs: make([]struct {
		Amount api.Amount  `json:"amount"`
		Kept   *api.Amount `json:"kept,omitempty"`
		Stock  string      `json:"stock"`
	}, len(view.core.Constituents))}
	for i, constituent := range view.core.Constituents {
		proceeds, err := basket.Out(constituent, shares, view.core.Supply)
		if err != nil {
			problem := gatewayProblem(http.StatusUnprocessableEntity, "Melt proceeds unavailable", err.Error())
			return api.GetAlloyMeltProceedsdefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: problem.Status}, nil
		}
		required, err := basket.RequiredIn(constituent, shares, view.core.Supply)
		if err != nil {
			problem := gatewayProblem(http.StatusInternalServerError, "Melt proceeds could not be encoded", err.Error())
			return api.GetAlloyMeltProceedsdefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: problem.Status}, nil
		}
		keptByRounding, err := required.Sub(proceeds)
		if err != nil {
			problem := gatewayProblem(http.StatusInternalServerError, "Melt proceeds could not be encoded", err.Error())
			return api.GetAlloyMeltProceedsdefaultApplicationProblemPlusJSONResponse{Body: problem, StatusCode: problem.Status}, nil
		}
		kept := wireAmount(keptByRounding)
		row.Legs[i].Stock = constituent.Mint
		row.Legs[i].Amount = wireAmount(proceeds)
		row.Legs[i].Kept = &kept
	}
	now := s.now()
	return api.GetAlloyMeltProceeds200JSONResponse{Data: row, Meta: s.hallMeta(now)}, nil
}

func (s Server) getAlloy(ctx context.Context, address string) (alloyView, *api.Problem) {
	if problem := s.hallConfigured(); problem != nil {
		return alloyView{}, problem
	}
	if _, err := registry.ParsePubkey(address); err != nil {
		problem := gatewayProblem(http.StatusBadRequest, "Alloy address is invalid", fmt.Sprintf("address %q is not a Solana public key: %v", address, err))
		return alloyView{}, &problem
	}
	account, err := s.Hall.GetAccountInfo(ctx, address, "finalized")
	if err != nil {
		problem := gatewayProblem(http.StatusBadGateway, "Hall read failed", fmt.Sprintf("reading Alloy account %s: %v", address, err))
		return alloyView{}, &problem
	}
	if account == nil {
		problem := gatewayProblem(http.StatusNotFound, "Alloy not found", fmt.Sprintf("the Hall returned no account at %s", address))
		return alloyView{}, &problem
	}
	view, err := s.decodeAlloy(ctx, account)
	if err != nil {
		problem := gatewayProblem(http.StatusBadGateway, "Hall account could not be decoded", err.Error())
		return alloyView{}, &problem
	}
	return view, nil
}

func (s Server) decodeAlloy(ctx context.Context, account *solana.Account) (alloyView, error) {
	if account.Owner != s.HallProgramID {
		return alloyView{}, fmt.Errorf("account %s is owned by %s, want the configured Hall program %s", account.Address, account.Owner, s.HallProgramID)
	}
	address, err := registry.ParsePubkey(account.Address)
	if err != nil {
		return alloyView{}, fmt.Errorf("Alloy account address %q: %w", account.Address, err)
	}
	chain, err := basket.DecodeAlloy(address, account.Data)
	if err != nil {
		return alloyView{}, err
	}

	addresses := make([]string, 0, len(chain.Legs)*2)
	for _, leg := range chain.Legs {
		addresses = append(addresses, leg.Mint.String(), leg.HallAccount.String())
	}
	_, related, err := s.Hall.GetMultipleAccounts(ctx, addresses, "finalized")
	if err != nil {
		return alloyView{}, fmt.Errorf("reading mint and Hall-owned accounts for %s: %w", account.Address, err)
	}
	if len(related) != len(addresses) {
		return alloyView{}, fmt.Errorf("reading %d related accounts for %s returned %d", len(addresses), account.Address, len(related))
	}

	wire := api.Alloy{
		Address:       account.Address,
		Cluster:       api.AlloyCluster(s.HallCluster),
		Id:            fmt.Sprint(chain.ID),
		Legs:          make([]api.AlloyLeg, len(chain.Legs)),
		ShareMint:     chain.ShareMint.String(),
		Sponsor:       chain.Sponsor.String(),
		Supply:        fmt.Sprint(chain.Supply),
		LockedGenesis: stringPointer(fmt.Sprint(chain.LockedGenesis)),
	}
	if mark := hex.EncodeToString(chain.SponsorMark[:]); mark != "0000000000000000000000000000000000000000000000000000000000000000" {
		wire.SponsorMark = &mark
	}
	core := basket.Alloy{Supply: new(big.Int).SetUint64(chain.Supply), Constituents: make([]basket.Constituent, len(chain.Legs))}
	for i, leg := range chain.Legs {
		mintAccount := related[i*2]
		hallAccount := related[i*2+1]
		if mintAccount == nil {
			return alloyView{}, fmt.Errorf("mint account %s used by Alloy %s is absent", leg.Mint, account.Address)
		}
		if mintAccount.Owner != leg.TokenProgram.String() {
			return alloyView{}, fmt.Errorf("mint account %s is owned by %s, want the Alloy leg's token program %s", leg.Mint, mintAccount.Owner, leg.TokenProgram)
		}
		mint, err := registry.DecodeMint(mintAccount.Data)
		if err != nil {
			return alloyView{}, fmt.Errorf("decoding mint %s used by Alloy %s: %w", leg.Mint, account.Address, err)
		}
		if hallAccount == nil {
			return alloyView{}, fmt.Errorf("Hall-owned token account %s for mint %s is absent", leg.HallAccount, leg.Mint)
		}
		if hallAccount.Owner != leg.TokenProgram.String() {
			return alloyView{}, fmt.Errorf("Hall-owned token account %s is owned by %s, want %s", leg.HallAccount, hallAccount.Owner, leg.TokenProgram)
		}
		frozen, err := basket.TokenAccountFrozen(hallAccount.Data)
		if err != nil {
			return alloyView{}, fmt.Errorf("decoding Hall-owned token account %s: %w", leg.HallAccount, err)
		}
		scale := int32(mint.Decimals)
		ledger, err := amount.FromBig(new(big.Int).SetUint64(leg.Ledger), scale)
		if err != nil {
			return alloyView{}, err
		}
		pending, err := amount.FromBig(new(big.Int).SetUint64(leg.Pending), scale)
		if err != nil {
			return alloyView{}, err
		}
		unclaimed, err := amount.FromBig(new(big.Int).SetUint64(leg.Unclaimed), scale)
		if err != nil {
			return alloyView{}, err
		}
		wireLeg := api.AlloyLeg{
			HeldBack:  frozen,
			Ledger:    wireAmount(ledger),
			Mint:      leg.Mint.String(),
			Pending:   wireAmount(pending),
			Unclaimed: wireAmount(unclaimed),
		}
		if frozen {
			reason := "The issuer currently prevents this Hall account from delivering."
			wireLeg.HeldBackReason = &reason
		}
		if !leg.VestStart.IsZero() {
			wireLeg.VestStart = &leg.VestStart
		}
		if !leg.VestEnd.IsZero() {
			wireLeg.VestEnd = &leg.VestEnd
		}
		wire.Legs[i] = wireLeg
		core.Constituents[i] = basket.Constituent{
			Mint: leg.Mint.String(), Ledger: ledger, Pending: pending, Unclaimed: unclaimed,
			VestStart: leg.VestStart, VestEnd: leg.VestEnd, ClaimIndex: leg.ClaimIndex, ClaimEpoch: leg.ClaimEpoch,
		}
	}
	return alloyView{chain: chain, api: wire, core: core}, nil
}

func (s Server) hallConfigured() *api.Problem {
	if s.Hall == nil || s.HallProgramID == "" || s.HallCluster == "" {
		problem := gatewayProblem(http.StatusServiceUnavailable, "Hall read unavailable", "the Gateway has no Hall RPC reader, program id, or cluster configured")
		return &problem
	}
	return nil
}

func (s Server) now() time.Time {
	if s.Now == nil {
		return time.Now().UTC()
	}
	return s.Now().UTC()
}

func (s Server) hallMeta(now time.Time) api.Meta {
	cluster := api.MetaCluster(s.HallCluster)
	return api.Meta{AsOf: now, ServedAt: now, Completeness: api.Complete, Cluster: &cluster}
}

func parseShares(raw string) (*big.Int, *api.Problem) {
	shares, ok := new(big.Int).SetString(raw, 10)
	if !ok || shares.Sign() <= 0 {
		problem := gatewayProblem(http.StatusBadRequest, "Share count is invalid", fmt.Sprintf("shares %q must be a positive base 10 integer", raw))
		return nil, &problem
	}
	return shares, nil
}

func wireAmount(value amount.Amount) api.Amount {
	return api.Amount{Atoms: value.AtomsString(), Scale: int(value.Scale())}
}

func stringPointer(value string) *string { return &value }

func gatewayProblem(status int, title, detail string) api.Problem {
	return api.Problem{Type: problemTypeUnspecified, Title: title, Status: status, Detail: detail}
}
