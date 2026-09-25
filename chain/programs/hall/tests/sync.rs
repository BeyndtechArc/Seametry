mod common;

use {
    anchor_lang::prelude::Pubkey,
    common::{alloy_with_leg, World},
    hall::recipe::VEST_WINDOW_SECONDS,
};

fn logs(result: &Result<litesvm::types::TransactionMetadata, litesvm::types::FailedTransactionMetadata>) -> String {
    match result {
        Ok(meta) => meta.logs.join("\n"),
        Err(failed) => failed.meta.logs.join("\n"),
    }
}

fn sync_accounts(alloy: Pubkey, hall_account: Pubkey) -> hall::accounts::SyncLeg {
    hall::accounts::SyncLeg { alloy, hall_account }
}

#[test]
fn a_donation_becomes_pending_then_vests() {
    let mut world = World::new();
    let mint = Pubkey::new_unique();
    let account = world.put_token_account(mint, 1_000_000);
    let alloy = world.put_alloy(&alloy_with_leg(mint, account, 1_000_000, 0, 1_000));

    world.set_clock(1_000);
    world.set_token_amount(account, 2_000_000);
    world.send(hall::instruction::Sync { leg_index: 0 }, sync_accounts(alloy, account)).unwrap();
    let leg = world.alloy(alloy).legs[0];
    assert_eq!((leg.ledger, leg.pending, leg.vest_start), (1_000_000, 1_000_000, 1_000));

    world.set_clock(1_000 + VEST_WINDOW_SECONDS / 2);
    world.send(hall::instruction::Sync { leg_index: 0 }, sync_accounts(alloy, account)).unwrap();
    let leg = world.alloy(alloy).legs[0];
    assert_eq!((leg.ledger, leg.pending), (1_500_000, 500_000));
}

#[test]
fn a_seizure_falls_on_ledger_and_unclaimed_pro_rata() {
    let mut world = World::new();
    let mint = Pubkey::new_unique();
    let account = world.put_token_account(mint, 1_000_000);
    let alloy = world.put_alloy(&alloy_with_leg(mint, account, 600_000, 400_000, 1_000));

    world.set_token_amount(account, 500_000);
    world.send(hall::instruction::Sync { leg_index: 0 }, sync_accounts(alloy, account)).unwrap();
    let leg = world.alloy(alloy).legs[0];
    assert_eq!((leg.ledger, leg.pending, leg.unclaimed), (300_000, 0, 200_000));
}

#[test]
fn a_token_account_that_is_not_the_halls_is_refused() {
    let mut world = World::new();
    let mint = Pubkey::new_unique();
    let account = world.put_token_account(mint, 1_000_000);
    let stranger = world.put_token_account(mint, 9_999_999);
    let alloy = world.put_alloy(&alloy_with_leg(mint, account, 1_000_000, 0, 1_000));

    let result = world.send(hall::instruction::Sync { leg_index: 0 }, sync_accounts(alloy, stranger));
    assert!(result.is_err(), "sync accepted an account that is not the Hall's");
    assert!(logs(&result).contains("WrongHallAccount"), "{}", logs(&result));
}

#[test]
fn an_index_past_the_constituents_is_refused() {
    let mut world = World::new();
    let mint = Pubkey::new_unique();
    let account = world.put_token_account(mint, 1_000_000);
    let alloy = world.put_alloy(&alloy_with_leg(mint, account, 1_000_000, 0, 1_000));

    let result = world.send(hall::instruction::Sync { leg_index: 1 }, sync_accounts(alloy, account));
    assert!(result.is_err());
    assert!(logs(&result).contains("UnknownConstituent"), "{}", logs(&result));
}
