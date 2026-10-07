package main

import "testing"

// The shape of api.backpack.exchange/api/v1/assets on 7 October 2026, cut to
// the cases that matter: a withdrawable stock, a stock that cannot leave the
// exchange, a stock with no Solana token, and a crypto asset.
const backpackSample = `[
  {"symbol":"SPCX.US","displayName":"SpaceX","tokens":[{"blockchain":"Solana","contractAddress":"SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb","withdrawEnabled":true}]},
  {"symbol":"AAPL.US","displayName":"Apple Inc.","tokens":[{"blockchain":"Solana","contractAddress":"AAPLEDt8RpzPgXyhvFzkMBofvFSQw9gpeMCoUdPdLnB8","withdrawEnabled":false}]},
  {"symbol":"ZZZ.US","displayName":"No token","tokens":[]},
  {"symbol":"BTC","displayName":"Bitcoin","tokens":[{"blockchain":"Solana","contractAddress":"cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij","withdrawEnabled":true}]}
]`

func TestBackpackListingKeepsUSStocksWithASolanaToken(t *testing.T) {
	tokens, err := parseBackpackAssets([]byte(backpackSample))
	if err != nil {
		t.Fatal(err)
	}
	if len(tokens) != 2 {
		t.Fatalf("kept %d tokens, want SPCX and AAPL only: %+v", len(tokens), tokens)
	}
	if tokens[0].Symbol != "SPCX" || tokens[0].Mint != "SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb" || !*tokens[0].Withdrawable {
		t.Fatalf("SPCX read as %+v", tokens[0])
	}
	if tokens[1].Symbol != "AAPL" || *tokens[1].Withdrawable {
		t.Fatalf("AAPL, which cannot leave the exchange, read as %+v", tokens[1])
	}
}

func TestBackpackListingRefusesAnUnexpectedShape(t *testing.T) {
	if _, err := parseBackpackAssets([]byte(`{"error":"rate limited"}`)); err == nil {
		t.Fatal("an object where the asset array belongs was accepted")
	}
}
