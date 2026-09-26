mod common;

use {
    anchor_lang::{prelude::Pubkey, ToAccountMetas},
    anchor_spl::{
        token::spl_token::{self, state::AccountState},
        token_2022,
    },
    common::{alloy::*, fixture::*},
};

/// Strikes so the striker holds `shares`, asserting it worked.
fn struck(shares: u64) -> Fixture {
    let mut fixture = Fixture::new();
    let outcome = fixture.strike(shares, vec![u64::MAX, u64::MAX]);
    assert!(outcome.is_ok(), "{}", logs(&outcome));
    fixture
}

#[test]
fn a_melt_burns_the_shares_and_credits_a_claim_without_moving_any_token() {
    let mut fixture = struck(1_000);
    let before = fixture.balances();
    let alloy_before = fixture.world.alloy(fixture.at.alloy);

    let outcome = fixture.redeem(400);
    assert!(outcome.is_ok(), "{}", logs(&outcome));

    let after = fixture.balances();
    assert_eq!(after[0], 600, "shares left with the striker");
    assert_eq!(
        &after[1..],
        &before[1..],
        "a melt moved a constituent token"
    );

    let alloy = fixture.world.alloy(fixture.at.alloy);
    assert_eq!(alloy.supply, alloy_before.supply - 400);
    let claim = fixture.claim(fixture.striker_key());
    for index in 0..2 {
        let owed = 400 * alloy_before.legs[index].ledger / alloy_before.supply;
        assert_eq!(claim.entries[index].units, owed, "claim on leg {index}");
        assert_eq!(
            alloy.legs[index].unclaimed, owed,
            "unclaimed on leg {index}"
        );
        assert_eq!(
            alloy.legs[index].ledger,
            alloy_before.legs[index].ledger - owed
        );
    }
    fixture.assert_balances_match_ledgers("after redeem");
}

#[test]
fn a_melt_rounds_down_so_a_round_trip_never_profits() {
    let mut fixture = Fixture::new();
    let before = fixture.balances();

    fixture.strike(3, vec![1_000, 1_000]).unwrap();
    fixture.redeem(3).unwrap();
    fixture
        .withdraw(0, fixture.claim(fixture.striker_key()).entries[0].units)
        .unwrap();
    fixture
        .withdraw(1, fixture.claim(fixture.striker_key()).entries[1].units)
        .unwrap();

    let after = fixture.balances();
    for index in [1, 3] {
        assert!(
            after[index] <= before[index],
            "the round trip left the striker with more of a constituent: {} against {}",
            after[index],
            before[index]
        );
    }
    assert!(
        after[1] < before[1] || after[3] < before[3],
        "rounding should have cost the striker at least one unit somewhere"
    );
}

/// Guarantee 1. The issuer freezes the Hall's account and the constituent's
/// mint is not even readable, and the melt still succeeds. The logs show no
/// call into the constituent's token program.
#[test]
fn a_melt_succeeds_while_a_constituent_is_frozen_and_its_mint_is_gone() {
    let mut fixture = struck(1_000);
    let classic_mint = fixture.sources[0].mint;
    let classic_hall = fixture.hall(0);
    fixture
        .world
        .set_token_state(classic_hall, AccountState::Frozen);
    fixture.world.erase(classic_mint);

    let outcome = fixture.redeem(400);

    assert!(outcome.is_ok(), "{}", logs(&outcome));
    let log = logs(&outcome);
    assert!(
        !log.contains(&format!("Program {} invoke", spl_token::ID)),
        "a melt invoked the classic token program:\n{log}"
    );
    assert!(
        log.contains(&format!("Program {} invoke", token_2022::ID)),
        "expected the share burn to invoke Token-2022:\n{log}"
    );
    assert!(fixture.claim(fixture.striker_key()).entries[0].units > 0);
}

#[test]
fn a_melt_takes_no_constituent_mint_and_no_constituent_token_program() {
    let fixture = Fixture::new();
    let mut metas = hall::accounts::Redeem {
        caller: fixture.striker_key(),
        alloy: fixture.at.alloy,
        share_mint: fixture.at.share_mint,
        caller_shares: fixture.striker_shares,
        claim: fixture.claim_address(fixture.striker_key()),
        share_token_program: token_2022::ID,
        system_program: anchor_lang::solana_program::system_program::ID,
    }
    .to_account_metas(None);
    metas.extend(fixture.hall_metas());
    let taken: Vec<Pubkey> = metas.iter().map(|meta| meta.pubkey).collect();

    for leg in &fixture.sources {
        assert!(
            !taken.contains(&leg.mint),
            "a melt is given a constituent mint"
        );
    }
    assert!(
        !taken.contains(&spl_token::ID),
        "a melt is given the classic token program, which is a constituent's"
    );
}

#[test]
fn a_melt_is_priced_after_syncing_a_seizure() {
    let mut fixture = struck(1_000);
    let before = fixture.world.alloy(fixture.at.alloy);
    let held = fixture.world.token_amount(fixture.hall(0));
    fixture.world.set_token_amount(fixture.hall(0), held / 2);

    fixture.redeem(400).unwrap();

    let priced_on_the_stale_ledger = 400 * before.legs[0].ledger / before.supply;
    let owed = fixture.claim(fixture.striker_key()).entries[0].units;
    assert!(
        owed < priced_on_the_stale_ledger,
        "owed {owed}, which is not below {priced_on_the_stale_ledger}, the price on the ledger from before the seizure"
    );
    fixture.assert_balances_match_ledgers("after a melt over a seizure");
}

#[test]
fn two_melts_add_to_the_same_claim() {
    let mut fixture = struck(1_000);
    fixture.redeem(100).unwrap();
    let first = fixture.claim(fixture.striker_key()).entries[0].units;
    fixture.redeem(100).unwrap();
    let second = fixture.claim(fixture.striker_key()).entries[0].units;
    assert!(second > first, "the second melt did not add to the claim");
    assert_eq!(
        fixture.world.alloy(fixture.at.alloy).legs[0].unclaimed,
        second,
        "one owner's claim should equal the leg's unclaimed"
    );
}

#[test]
fn melting_more_shares_than_held_is_refused_and_moves_nothing() {
    let mut fixture = struck(1_000);
    let before = fixture.balances();
    let supply = fixture.world.alloy(fixture.at.alloy).supply;

    let outcome = fixture.redeem(1_001);

    assert!(outcome.is_err(), "melted shares the striker does not hold");
    assert_eq!(fixture.balances(), before);
    assert_eq!(fixture.world.alloy(fixture.at.alloy).supply, supply);
}

#[test]
fn zero_shares_are_refused() {
    let mut fixture = struck(1_000);
    assert_refused(&fixture.redeem(0), "ZeroShares");
}

#[test]
fn a_hall_account_that_is_not_the_alloys_is_refused() {
    let mut fixture = struck(1_000);
    let mut remaining = fixture.hall_metas();
    remaining.swap(0, 1);
    let shares = fixture.striker_shares;
    let mint = fixture.at.share_mint;
    assert_refused(
        &fixture.redeem_with(10, mint, shares, remaining),
        "WrongHallAccount",
    );
}

#[test]
fn a_counterfeit_share_mint_is_refused() {
    let mut fixture = struck(1_000);
    let supply = fixture.world.alloy(fixture.at.alloy).supply;
    let counterfeit =
        fixture
            .world
            .put_mint_with_authority(token_2022::ID, 6, Some(fixture.at.alloy));
    let account = Pubkey::new_unique();
    let owner = fixture.striker_key();
    fixture
        .world
        .put_token_account_at(account, token_2022::ID, counterfeit, owner, 1_000);
    let remaining = fixture.hall_metas();

    let outcome = fixture.redeem_with(10, counterfeit, account, remaining);

    assert_refused(&outcome, "WrongShareMint");
    assert_eq!(fixture.world.alloy(fixture.at.alloy).supply, supply);
}
