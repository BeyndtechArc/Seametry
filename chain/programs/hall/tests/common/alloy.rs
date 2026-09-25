//! Builds an alloy through the real `initialize_alloy` instruction, so tests of
//! later instructions start from state the program itself wrote.

#![allow(dead_code)]

use {
    super::World,
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::AccountMeta, system_program},
    },
    anchor_spl::{
        associated_token::{self, get_associated_token_address_with_program_id},
        token_2022,
    },
    hall::{
        instructions::InitializeAlloyArgs,
        state::{ALLOY_SEED, LOCKED_SEED, SHARE_SEED},
    },
    litesvm::types::{FailedTransactionMetadata, TransactionMetadata},
};

pub type Outcome = Result<TransactionMetadata, FailedTransactionMetadata>;

pub const ID: u64 = 7;
pub const GENESIS: u64 = 1_000_000;

pub struct Deposit {
    pub mint: Pubkey,
    pub source: Pubkey,
    pub program: Pubkey,
    pub amount: u64,
}

pub struct Addresses {
    pub alloy: Pubkey,
    pub share_mint: Pubkey,
    pub locked: Pubkey,
}

pub fn addresses(sponsor: Pubkey) -> Addresses {
    let alloy = Pubkey::find_program_address(
        &[ALLOY_SEED, sponsor.as_ref(), &ID.to_le_bytes()],
        &hall::ID,
    )
    .0;
    Addresses {
        alloy,
        share_mint: Pubkey::find_program_address(&[SHARE_SEED, alloy.as_ref()], &hall::ID).0,
        locked: Pubkey::find_program_address(&[LOCKED_SEED, alloy.as_ref()], &hall::ID).0,
    }
}

pub fn hall_account(alloy: Pubkey, deposit: &Deposit) -> Pubkey {
    get_associated_token_address_with_program_id(&alloy, &deposit.mint, &deposit.program)
}

/// The per-constituent accounts every instruction after initialization takes.
pub fn leg_accounts(alloy: Pubkey, deposits: &[Deposit]) -> Vec<AccountMeta> {
    deposits
        .iter()
        .flat_map(|d| {
            [
                AccountMeta::new_readonly(d.mint, false),
                AccountMeta::new(d.source, false),
                AccountMeta::new(hall_account(alloy, d), false),
                AccountMeta::new_readonly(d.program, false),
            ]
        })
        .collect()
}

pub fn initialize(world: &mut World, deposits: &[Deposit], amounts: Vec<u64>) -> Outcome {
    let sponsor = world.sponsor();
    let at = addresses(sponsor);
    world.send_with_remaining(
        hall::instruction::InitializeAlloy {
            args: InitializeAlloyArgs {
                id: ID,
                sponsor_mark: [9; 32],
                name: "Alloy No. 1".to_string(),
                symbol: "ALY1".to_string(),
                uri: "https://example.invalid/alloy-1".to_string(),
                genesis_shares: GENESIS,
                deposits: amounts,
            },
        },
        hall::accounts::InitializeAlloy {
            sponsor,
            alloy: at.alloy,
            share_mint: at.share_mint,
            locked_shares: at.locked,
            share_token_program: token_2022::ID,
            associated_token_program: associated_token::ID,
            system_program: system_program::ID,
        },
        leg_accounts(at.alloy, deposits),
    )
}

/// A mint of `program` and an account of the sponsor's holding `amount` of it.
pub fn funded(world: &mut World, program: Pubkey, amount: u64) -> Deposit {
    funded_for(world, world.sponsor(), program, amount)
}

pub fn funded_for(world: &mut World, owner: Pubkey, program: Pubkey, amount: u64) -> Deposit {
    let mint = world.put_mint(program, 6);
    let source = Pubkey::new_unique();
    world.put_token_account_at(source, program, mint, owner, amount);
    Deposit {
        mint,
        source,
        program,
        amount,
    }
}

pub fn amounts(deposits: &[Deposit]) -> Vec<u64> {
    deposits.iter().map(|d| d.amount).collect()
}

pub fn logs(outcome: &Outcome) -> String {
    match outcome {
        Ok(meta) => meta.logs.join("\n"),
        Err(failed) => failed.meta.logs.join("\n"),
    }
}

pub fn assert_refused(outcome: &Outcome, reason: &str) {
    assert!(
        outcome.is_err(),
        "expected {reason}, but the instruction succeeded"
    );
    assert!(
        logs(outcome).contains(reason),
        "expected {reason} in:\n{}",
        logs(outcome)
    );
}
