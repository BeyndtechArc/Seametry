mod common;

use {
    anchor_lang::prelude::Pubkey,
    anchor_spl::token::spl_token::{self, state::AccountState},
    common::{alloy::*, fixture::*},
    hall::recipe,
    solana_keypair::Keypair,
    solana_signer::Signer,
};

/// The striker strikes 1,000 shares and melts 400 of them, leaving a claim.
fn melted() -> Fixture {
    let mut fixture = Fixture::new();
    fixture.strike(1_000, vec![u64::MAX, u64::MAX]).unwrap();
    fixture.redeem(400).unwrap();
    fixture
}

fn owed(fixture: &Fixture, leg: usize) -> u64 {
    fixture.claim(fixture.striker_key()).entries[leg].units
}

#[test]
fn a_withdrawal_delivers_the_units_and_reduces_the_claim_and_unclaimed() {
    let mut fixture = melted();
    let due = owed(&fixture, 0);
    let received_before = fixture.world.token_amount(fixture.sources[0].source);
    let hall_before = fixture.world.token_amount(fixture.hall(0));

    let outcome = fixture.withdraw(0, due);
    assert!(outcome.is_ok(), "{}", logs(&outcome));

    assert_eq!(
        fixture.world.token_amount(fixture.sources[0].source),
        received_before + due
    );
    assert_eq!(
        fixture.world.token_amount(fixture.hall(0)),
        hall_before - due
    );
    assert_eq!(owed(&fixture, 0), 0);
    assert_eq!(fixture.world.alloy(fixture.at.alloy).legs[0].unclaimed, 0);
    fixture.assert_balances_match_ledgers("after withdraw");
}

#[test]
fn a_frozen_leg_stays_a_claim_and_delivers_once_thawed() {
    let mut fixture = melted();
    let due = owed(&fixture, 0);
    let hall = fixture.hall(0);
    fixture.world.set_token_state(hall, AccountState::Frozen);
    let before = fixture.balances();

    let outcome = fixture.withdraw(0, due);

    assert!(outcome.is_err(), "withdrew through a frozen account");
    assert_eq!(
        fixture.balances(),
        before,
        "a refused withdrawal moved tokens"
    );
    assert_eq!(
        owed(&fixture, 0),
        due,
        "the claim changed although nothing was delivered"
    );

    fixture
        .world
        .set_token_state(hall, AccountState::Initialized);
    let outcome = fixture.withdraw(0, due);
    assert!(outcome.is_ok(), "{}", logs(&outcome));
    assert_eq!(owed(&fixture, 0), 0);
}

#[test]
fn the_other_leg_still_delivers_while_one_is_frozen() {
    let mut fixture = melted();
    let hall = fixture.hall(0);
    fixture.world.set_token_state(hall, AccountState::Frozen);

    let due = owed(&fixture, 1);
    let outcome = fixture.withdraw(1, due);

    assert!(outcome.is_ok(), "{}", logs(&outcome));
    assert!(
        owed(&fixture, 0) > 0,
        "the frozen leg's claim should still stand"
    );
}

/// A seizure shrinks the claim in proportion. Taking the original units is
/// refused, and taking the settled amount works.
#[test]
fn a_seizure_shrinks_the_claim_before_it_is_withdrawn() {
    let mut fixture = melted();
    let original = owed(&fixture, 0);
    let held = fixture.world.token_amount(fixture.hall(0));
    fixture.world.set_token_amount(fixture.hall(0), held / 2);

    let refused = fixture.withdraw(0, original);
    assert_refused(&refused, "ExceedsUnclaimed");

    fixture
        .world
        .send(
            hall::instruction::Sync { leg_index: 0 },
            hall::accounts::SyncLeg {
                alloy: fixture.at.alloy,
                hall_account: fixture.hall(0),
            },
        )
        .unwrap();
    let alloy = fixture.world.alloy(fixture.at.alloy);
    let entry = fixture.claim(fixture.striker_key()).entries[0];
    let settled = recipe::settle(&entry.claim_leg(), &alloy.legs[0].leg())
        .unwrap()
        .units;
    assert!(
        settled < original,
        "the seizure did not shrink the claim: {settled} against {original}"
    );

    assert_refused(&fixture.withdraw(0, settled + 1), "ExceedsUnclaimed");
    let outcome = fixture.withdraw(0, settled);
    assert!(outcome.is_ok(), "{}", logs(&outcome));
    fixture.assert_balances_match_ledgers("after withdrawing a shrunken claim");
}

#[test]
fn withdrawing_more_than_the_claim_is_refused() {
    let mut fixture = melted();
    let due = owed(&fixture, 0);
    assert_refused(&fixture.withdraw(0, due + 1), "ExceedsUnclaimed");
}

#[test]
fn a_partial_withdrawal_leaves_the_rest_of_the_claim() {
    let mut fixture = melted();
    let due = owed(&fixture, 0);
    fixture.withdraw(0, due / 2).unwrap();
    assert_eq!(owed(&fixture, 0), due - due / 2);
}

#[test]
fn zero_units_are_refused() {
    let mut fixture = melted();
    assert_refused(&fixture.withdraw(0, 0), "ZeroUnits");
}

#[test]
fn a_wallet_with_no_claim_cannot_withdraw() {
    let mut fixture = melted();
    let stranger = Keypair::new();
    fixture
        .world
        .svm
        .airdrop(&stranger.pubkey(), 1_000_000_000)
        .unwrap();
    let destination = Pubkey::new_unique();
    let leg = &fixture.sources[0];
    fixture
        .world
        .put_token_account_at(destination, leg.program, leg.mint, stranger.pubkey(), 0);

    let outcome = fixture.world.send_as(
        &stranger,
        hall::instruction::Withdraw {
            leg_index: 0,
            units: 1,
        },
        hall::accounts::Withdraw {
            owner: stranger.pubkey(),
            alloy: fixture.at.alloy,
            claim: fixture.claim_address(stranger.pubkey()),
            mint: leg.mint,
            hall_account: fixture.hall(0),
            destination,
            token_program: leg.program,
        },
        vec![],
    );

    assert_refused(&outcome, "AccountNotInitialized");
}

#[test]
fn a_destination_the_owner_does_not_hold_is_refused() {
    let mut fixture = melted();
    let due = owed(&fixture, 0);
    let stranger_account = Pubkey::new_unique();
    let mint = fixture.sources[0].mint;
    fixture.world.put_token_account_at(
        stranger_account,
        spl_token::ID,
        mint,
        Pubkey::new_unique(),
        0,
    );

    assert_refused(
        &fixture.withdraw_to(0, due, stranger_account),
        "ConstraintTokenOwner",
    );
}

#[test]
fn accounts_that_are_not_the_alloys_for_that_leg_are_refused() {
    let mut fixture = melted();
    let leg = &fixture.sources[1];
    let (mint, program, source) = (leg.mint, leg.program, leg.source);
    let owner = fixture.striker_key();

    let outcome = fixture.world.send_as(
        &fixture.striker,
        hall::instruction::Withdraw {
            leg_index: 0,
            units: 1,
        },
        hall::accounts::Withdraw {
            owner,
            alloy: fixture.at.alloy,
            claim: fixture.claim_address(owner),
            mint,
            hall_account: fixture.hall(1),
            destination: source,
            token_program: program,
        },
        vec![],
    );

    assert_refused(&outcome, "WrongConstituentAccounts");
}

/// Two claimants share a seizure in proportion. Neither can draw more than
/// their own shrunken claim, even though the Hall holds enough for the sum.
#[test]
fn a_seizure_is_shared_between_claimants_and_neither_can_take_the_others_part() {
    let mut fixture = Fixture::new();
    let second = fixture.new_wallet();
    fixture.strike(1_000, vec![u64::MAX, u64::MAX]).unwrap();
    fixture.strike_as(&second, 1_000).unwrap();
    fixture.redeem(400).unwrap();
    fixture.redeem_as(&second, 200).unwrap();

    let held = fixture.world.token_amount(fixture.hall(0));
    fixture.world.set_token_amount(fixture.hall(0), held / 2);
    fixture
        .world
        .send(
            hall::instruction::Sync { leg_index: 0 },
            hall::accounts::SyncLeg {
                alloy: fixture.at.alloy,
                hall_account: fixture.hall(0),
            },
        )
        .unwrap();

    let leg = fixture.world.alloy(fixture.at.alloy).legs[0].leg();
    let mine = recipe::settle(
        &fixture.claim(fixture.striker_key()).entries[0].claim_leg(),
        &leg,
    )
    .unwrap()
    .units;
    let theirs = recipe::settle(
        &fixture.claim(second.key.pubkey()).entries[0].claim_leg(),
        &leg,
    )
    .unwrap()
    .units;
    assert!(
        mine + theirs <= leg.unclaimed,
        "settled claims exceed what the Hall holds for them"
    );
    assert!(
        leg.unclaimed - (mine + theirs) <= 1,
        "more than rounding dust is unaccounted for"
    );

    assert_refused(&fixture.withdraw(0, mine + 1), "ExceedsUnclaimed");
    assert!(fixture.withdraw(0, mine).is_ok());
    assert_refused(
        &fixture.withdraw_as(&second, 0, theirs + 1),
        "ExceedsUnclaimed",
    );
    assert!(fixture.withdraw_as(&second, 0, theirs).is_ok());
}
