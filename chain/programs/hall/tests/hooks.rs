//! The Hall against an issuer that switches on the transfer hook its mints
//! carry initialised and disabled, as reported for xStocks. Before 18 October
//! 2026 neither a deposit nor a delivery carried a hook's extra accounts, so
//! switching one on would have stopped strikes and left every claim on that
//! leg undeliverable (docs/decisions/2026-10-18-hall-pre-audit-fixes.md).
//!
//! The hook is `programs/hall-test-hook`, test only: it needs one account the
//! token program finds only through the hook's extra account list, and it
//! refuses every transfer while that account's first byte is not 1. Build it
//! with the Hall: `cargo-build-sbf --arch v0`.

mod common;

use {
    anchor_lang::{prelude::Pubkey, solana_program::instruction::AccountMeta},
    common::{alloy::*, stage::*},
    solana_account::Account,
    spl_tlv_account_resolution::{account::ExtraAccountMeta, state::ExtraAccountMetaList},
    spl_transfer_hook_interface::{
        get_extra_account_metas_address, instruction::ExecuteInstruction,
    },
    std::str::FromStr,
};

const HOOK_PATH: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../target/deploy/hall_test_hook.so"
);
const RENT: u64 = 1_000_000_000;

fn hook_program() -> Pubkey {
    Pubkey::from_str("FajxGQM3wz7frvf3WShtNC4YaPQQ78ZAiorEchjSTPM6").unwrap()
}

/// The accounts a transfer of the hooked mint must carry, and the gate.
struct Hook {
    gate: Pubkey,
    accounts: Vec<AccountMeta>,
}

fn set_gate(stage: &mut Stage, gate: Pubkey, open: bool) {
    stage
        .fixture
        .world
        .svm
        .set_account(
            gate,
            Account {
                lamports: RENT,
                data: vec![u8::from(open)],
                owner: hook_program(),
                ..Account::default()
            },
        )
        .unwrap();
}

/// The issuer switches stock `index`'s hook on, pointing it at the test hook,
/// whose extra account list names a gate that starts open or shut.
fn switch_on(stage: &mut Stage, index: usize, open: bool) -> Hook {
    let program = hook_program();
    let bytes = std::fs::read(HOOK_PATH)
        .unwrap_or_else(|e| panic!("cannot read {HOOK_PATH}: {e}. Run: cargo-build-sbf --arch v0"));
    stage
        .fixture
        .world
        .svm
        .add_program(program, &bytes)
        .unwrap();

    let gate = Pubkey::new_unique();
    set_gate(stage, gate, open);
    let mint = stage.stocks[index];
    let list = get_extra_account_metas_address(&mint, &program);
    let extras = [ExtraAccountMeta::new_with_pubkey(&gate, false, false).unwrap()];
    let mut data = vec![0u8; ExtraAccountMetaList::size_of(extras.len()).unwrap()];
    ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &extras).unwrap();
    stage
        .fixture
        .world
        .svm
        .set_account(
            list,
            Account {
                lamports: RENT,
                data,
                owner: program,
                ..Account::default()
            },
        )
        .unwrap();

    let outcome = stage
        .issuer
        .set_hook_program(&mut stage.fixture.world, mint, Some(program));
    assert!(outcome.is_ok(), "switching the hook on failed: {outcome:?}");
    Hook {
        gate,
        accounts: vec![
            AccountMeta::new_readonly(list, false),
            AccountMeta::new_readonly(gate, false),
            AccountMeta::new_readonly(program, false),
        ],
    }
}

fn strike_carrying(stage: &mut Stage, shares: u64, extra: &[AccountMeta]) -> Outcome {
    let fixture = &mut stage.fixture;
    let mut remaining = leg_accounts(fixture.at.alloy, &fixture.sources);
    remaining.extend_from_slice(extra);
    let (share_mint, shares_account) = (fixture.at.share_mint, fixture.striker_shares);
    fixture.strike_with(
        shares,
        vec![u64::MAX, u64::MAX],
        share_mint,
        shares_account,
        remaining,
    )
}

fn withdraw_carrying(stage: &mut Stage, leg: u8, units: u64, extra: &[AccountMeta]) -> Outcome {
    let destination = stage.fixture.sources[leg as usize].source;
    stage
        .fixture
        .withdraw_with(leg, units, destination, extra.to_vec())
}

#[test]
fn a_strike_carries_a_switched_on_hooks_accounts_and_fails_without_them() {
    let mut stage = Stage::struck();
    let hook = switch_on(&mut stage, 0, true);

    let without = strike_carrying(&mut stage, 10, &[]);
    assert!(
        without.is_err(),
        "a strike through a switched-on hook succeeded without its accounts:\n{}",
        logs(&without)
    );

    let with = strike_carrying(&mut stage, 10, &hook.accounts);
    assert!(with.is_ok(), "{}", logs(&with));
    assert!(
        logs(&with).contains(&format!("Program {} invoke", hook_program())),
        "the strike did not run the hook:\n{}",
        logs(&with)
    );
    stage
        .fixture
        .assert_balances_match_ledgers("after a hooked strike");
}

#[test]
fn a_claim_on_a_leg_whose_hook_was_switched_on_is_still_delivered() {
    let mut stage = Stage::struck();
    let melt = stage.fixture.redeem(400);
    assert!(melt.is_ok(), "{}", logs(&melt));
    let owed = stage.fixture.claim(stage.fixture.striker_key()).entries[0].units;
    let hook = switch_on(&mut stage, 0, true);
    let before = stage
        .fixture
        .world
        .token_amount(stage.fixture.sources[0].source);

    let delivered = withdraw_carrying(&mut stage, 0, owed, &hook.accounts);

    assert!(delivered.is_ok(), "{}", logs(&delivered));
    assert_eq!(
        stage
            .fixture
            .world
            .token_amount(stage.fixture.sources[0].source),
        before + owed
    );
    assert_eq!(
        stage.fixture.claim(stage.fixture.striker_key()).entries[0].units,
        0
    );
    stage
        .fixture
        .assert_leg_matches_ledger(0, "after a hooked delivery");
}

#[test]
fn a_hook_that_refuses_holds_the_leg_as_a_claim_and_cannot_stop_a_melt() {
    let mut stage = Stage::struck();
    let hook = switch_on(&mut stage, 0, false);

    let melt = stage.fixture.redeem(400);
    assert!(
        melt.is_ok(),
        "a refusing hook stopped a melt:\n{}",
        logs(&melt)
    );
    let owed = stage.fixture.claim(stage.fixture.striker_key()).entries[0].units;
    assert!(owed > 0);

    let refused = withdraw_carrying(&mut stage, 0, owed, &hook.accounts);
    assert_refused(&refused, "GateClosed");
    assert_eq!(
        stage.fixture.claim(stage.fixture.striker_key()).entries[0].units,
        owed,
        "a refused delivery changed the claim"
    );

    set_gate(&mut stage, hook.gate, true);
    let released = withdraw_carrying(&mut stage, 0, owed, &hook.accounts);
    assert!(released.is_ok(), "{}", logs(&released));
}
