//! Shared setup for tests that run the compiled program in litesvm.
//!
//! The tests load `chain/target/deploy/hall.so`. Build it first with
//! `cargo-build-sbf --arch v0`: litesvm 0.10.0 rejects the SBPF v3 that
//! `anchor build` emits by default.

#![allow(dead_code)]

use {
    anchor_lang::{
        prelude::{Clock, Pubkey},
        solana_program::{instruction::Instruction, program_pack::Pack},
        Discriminator, InstructionData, ToAccountMetas,
    },
    anchor_spl::token::spl_token::{
        self,
        state::{Account as TokenAccountState, AccountState},
    },
    hall::state::{Alloy, LegRecord},
    litesvm::{types::FailedTransactionMetadata, LiteSVM},
    solana_account::Account,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

const PROGRAM_PATH: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/deploy/hall.so");
const RENT_ENOUGH: u64 = 10_000_000_000;

pub struct World {
    pub svm: LiteSVM,
    pub payer: Keypair,
}

impl World {
    pub fn new() -> Self {
        let bytes = std::fs::read(PROGRAM_PATH).unwrap_or_else(|e| {
            panic!("cannot read {PROGRAM_PATH}: {e}. Run: cargo-build-sbf --arch v0")
        });
        let mut svm = LiteSVM::new();
        svm.add_program(hall::ID, &bytes).unwrap();
        let payer = Keypair::new();
        svm.airdrop(&payer.pubkey(), RENT_ENOUGH).unwrap();
        Self { svm, payer }
    }

    pub fn set_clock(&mut self, unix_timestamp: i64) {
        let mut clock = self.svm.get_sysvar::<Clock>();
        clock.unix_timestamp = unix_timestamp;
        self.svm.set_sysvar(&clock);
    }

    pub fn put_alloy(&mut self, alloy: &Alloy) -> Pubkey {
        let key = Pubkey::new_unique();
        let mut data = Alloy::DISCRIMINATOR.to_vec();
        data.extend_from_slice(bytemuck::bytes_of(alloy));
        self.svm
            .set_account(
                key,
                Account { lamports: RENT_ENOUGH, data, owner: hall::ID, ..Account::default() },
            )
            .unwrap();
        key
    }

    pub fn put_token_account(&mut self, mint: Pubkey, amount: u64) -> Pubkey {
        let key = Pubkey::new_unique();
        let state = TokenAccountState {
            mint,
            owner: Pubkey::new_unique(),
            amount,
            state: AccountState::Initialized,
            ..TokenAccountState::default()
        };
        let mut data = vec![0u8; TokenAccountState::LEN];
        TokenAccountState::pack(state, &mut data).unwrap();
        self.svm
            .set_account(
                key,
                Account { lamports: RENT_ENOUGH, data, owner: spl_token::ID, ..Account::default() },
            )
            .unwrap();
        key
    }

    pub fn set_token_amount(&mut self, key: Pubkey, amount: u64) {
        let mut account = self.svm.get_account(&key).unwrap();
        let mut state = TokenAccountState::unpack(&account.data).unwrap();
        state.amount = amount;
        TokenAccountState::pack(state, &mut account.data).unwrap();
        self.svm.set_account(key, account).unwrap();
    }

    pub fn alloy(&self, key: Pubkey) -> Alloy {
        let account = self.svm.get_account(&key).unwrap();
        *bytemuck::from_bytes(&account.data[Alloy::DISCRIMINATOR.len()..])
    }

    pub fn send(
        &mut self,
        data: impl InstructionData,
        accounts: impl ToAccountMetas,
    ) -> Result<litesvm::types::TransactionMetadata, FailedTransactionMetadata> {
        let instruction =
            Instruction::new_with_bytes(hall::ID, &data.data(), accounts.to_account_metas(None));
        self.svm.expire_blockhash();
        let blockhash = self.svm.latest_blockhash();
        let message = Message::new_with_blockhash(&[instruction], Some(&self.payer.pubkey()), &blockhash);
        let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(message), &[&self.payer]).unwrap();
        self.svm.send_transaction(tx)
    }
}

/// An alloy holding one constituent, for tests that exercise a single leg.
pub fn alloy_with_leg(mint: Pubkey, hall_account: Pubkey, ledger: u64, unclaimed: u64, supply: u64) -> Alloy {
    let mut alloy: Alloy = bytemuck::Zeroable::zeroed();
    alloy.supply = supply;
    alloy.constituent_count = 1;
    alloy.legs[0] = LegRecord {
        mint,
        token_program: spl_token::ID,
        hall_account,
        ledger,
        unclaimed,
        ..LegRecord::default()
    };
    alloy
}
