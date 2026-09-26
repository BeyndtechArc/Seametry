mod common;

use {
    anchor_lang::prelude::Pubkey,
    anchor_spl::{token::spl_token, token_2022},
    common::{alloy::*, fixture::*},
    solana_signer::Signer,
};

#[test]
fn a_strike_takes_exactly_the_rounded_up_amounts_and_mints_the_shares() {
    let mut fixture = Fixture::new();

    let outcome = fixture.strike(3, vec![1_000, 1_000]);
    assert!(outcome.is_ok(), "{}", logs(&outcome));

    // 3 * 5,000,001 / 1,000,000 = 15.000003 and 3 * 3,000,001 / 1,000,000 = 9.000003.
    // Rounding down would take 15 and 9. The Hall takes 16 and 10.
    assert_eq!(fixture.world.token_amount(fixture.striker_shares), 3);
    assert_eq!(
        fixture.world.token_amount(fixture.sources[0].source),
        1_000_000_000 - 16
    );
    assert_eq!(
        fixture.world.token_amount(fixture.sources[1].source),
        1_000_000_000 - 10
    );

    let alloy = fixture.world.alloy(fixture.at.alloy);
    assert_eq!(alloy.supply, GENESIS + 3);
    assert_eq!(alloy.locked_genesis, GENESIS);
    for (index, added) in [(0, 16), (1, 10)] {
        let leg = alloy.legs[index];
        let base = if index == 0 {
            CLASSIC_DEPOSIT
        } else {
            MODERN_DEPOSIT
        };
        assert_eq!(leg.ledger, base + added, "ledger for leg {index}");
        assert_eq!(
            fixture.world.token_amount(fixture.hall(index)),
            leg.ledger + leg.pending + leg.unclaimed,
            "balance invariant for leg {index}"
        );
    }
}

#[test]
fn a_maximum_below_the_requirement_refuses_the_strike_and_moves_nothing() {
    let mut fixture = Fixture::new();
    let before = fixture.balances();

    let outcome = fixture.strike(3, vec![1_000, 9]);

    assert_refused(&outcome, "ExceedsMaximum");
    assert_eq!(fixture.balances(), before, "a refused strike moved tokens");
    assert_eq!(fixture.world.alloy(fixture.at.alloy).supply, GENESIS);
}

#[test]
fn a_strike_is_priced_after_syncing_a_seizure() {
    let mut fixture = Fixture::new();
    // The issuer takes half of the classic constituent out of the Hall.
    let halved = CLASSIC_DEPOSIT / 2;
    fixture.world.set_token_amount(fixture.hall(0), halved);

    let outcome = fixture.strike(1_000, vec![u64::MAX, u64::MAX]);
    assert!(outcome.is_ok(), "{}", logs(&outcome));

    let leg = fixture.world.alloy(fixture.at.alloy).legs[0];
    let priced_on_the_old_ledger = 1_000 * CLASSIC_DEPOSIT / GENESIS;
    let taken = 1_000_000_000 - fixture.world.token_amount(fixture.sources[0].source);
    assert!(
        taken < priced_on_the_old_ledger,
        "took {taken}, which is not below {priced_on_the_old_ledger}, the price on the stale ledger"
    );
    assert_eq!(
        fixture.world.token_amount(fixture.hall(0)),
        leg.ledger + leg.pending + leg.unclaimed
    );
}

#[test]
fn a_donation_is_pending_and_does_not_lower_what_a_share_costs() {
    let mut fixture = Fixture::new();
    let donated = 4_000_000;
    fixture.world.set_token_amount(
        fixture.hall(0),
        fixture.world.token_amount(fixture.hall(0)) + donated,
    );

    let outcome = fixture.strike(1_000, vec![u64::MAX, u64::MAX]);
    assert!(outcome.is_ok(), "{}", logs(&outcome));

    let leg = fixture.world.alloy(fixture.at.alloy).legs[0];
    assert_eq!(leg.pending, donated, "a donation should wait out its vest");
    let taken = 1_000_000_000 - fixture.world.token_amount(fixture.sources[0].source);
    assert_eq!(taken, (1_000 * CLASSIC_DEPOSIT).div_ceil(GENESIS));
}

#[test]
fn zero_shares_are_refused() {
    let mut fixture = Fixture::new();
    assert_refused(&fixture.strike(0, vec![1_000, 1_000]), "ZeroShares");
}

#[test]
fn one_maximum_per_constituent_is_required() {
    let mut fixture = Fixture::new();
    assert_refused(&fixture.strike(3, vec![1_000]), "WrongMaximumsCount");
}

/// The mint names the alloy as its authority and the caller holds a matching
/// account, so only the alloy's own record of its share mint stands in the way.
/// Without that check the strike would raise the alloy's supply while minting a
/// token that is not its share.
#[test]
fn a_counterfeit_share_mint_is_refused() {
    let mut fixture = Fixture::new();
    let counterfeit =
        fixture
            .world
            .put_mint_with_authority(token_2022::ID, 6, Some(fixture.at.alloy));
    let account = Pubkey::new_unique();
    fixture.world.put_token_account_at(
        account,
        token_2022::ID,
        counterfeit,
        fixture.striker.pubkey(),
        0,
    );
    let remaining = leg_accounts(fixture.at.alloy, &fixture.sources);

    let outcome = fixture.strike_with(3, vec![1_000, 1_000], counterfeit, account, remaining);

    assert_refused(&outcome, "WrongShareMint");
    assert_eq!(fixture.world.alloy(fixture.at.alloy).supply, GENESIS);
}

#[test]
fn accounts_that_do_not_match_the_alloys_record_are_refused() {
    let mut fixture = Fixture::new();
    let mut remaining = leg_accounts(fixture.at.alloy, &fixture.sources);
    remaining.swap(0, 4);
    remaining.swap(1, 5);
    remaining.swap(2, 6);
    remaining.swap(3, 7);
    let shares = fixture.striker_shares;
    let outcome = fixture.strike_with(
        3,
        vec![1_000, 1_000],
        fixture.at.share_mint,
        shares,
        remaining,
    );
    assert_refused(&outcome, "WrongConstituentAccounts");
}

#[test]
fn a_source_account_owned_by_someone_else_is_refused() {
    let mut fixture = Fixture::new();
    let stranger = Pubkey::new_unique();
    let mint = fixture.sources[0].mint;
    let stolen = Pubkey::new_unique();
    fixture
        .world
        .put_token_account_at(stolen, spl_token::ID, mint, stranger, 1_000_000_000);
    fixture.sources[0].source = stolen;

    assert_refused(&fixture.strike(3, vec![1_000, 1_000]), "WrongSourceAccount");
}
