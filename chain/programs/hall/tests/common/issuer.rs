//! A mock issuer: real Token-2022 mints carrying the powers a tokenized stock's
//! issuer holds, and real transactions that use them.
//!
//! The mints reproduce the extension set reported for xStocks: a freeze
//! authority, a permanent delegate, pausing, and a transfer hook that is
//! initialised but points at no program. Nothing here is hand-packed account
//! data, so the token program enforces every rule the way it does on chain.
//!
//! Left out on purpose: the Scaled UI Amount extension, because its initializer
//! takes a float and this repository allows none. The Hall never reads a
//! multiplier, so no property under test depends on it.

#![allow(dead_code)]

use {
    super::{alloy::Outcome, World},
    anchor_lang::{prelude::Pubkey, solana_program::system_instruction},
    anchor_spl::{
        associated_token::{
            get_associated_token_address_with_program_id,
            spl_associated_token_account::instruction::create_associated_token_account_idempotent,
        },
        token_2022,
        token_interface::spl_token_2022::{
            extension::{
                default_account_state::instruction::initialize_default_account_state,
                pausable::instruction as pausable, transfer_fee::instruction as transfer_fee,
                transfer_hook::instruction as transfer_hook, ExtensionType,
            },
            instruction as token,
            state::{AccountState, Mint},
        },
    },
    solana_keypair::Keypair,
    solana_signer::Signer,
};

pub const STOCK_DECIMALS: u8 = 6;

/// Which powers a mock stock carries beyond the freeze authority every one has.
#[derive(Clone, Copy, Default)]
pub struct Powers {
    pub permanent_delegate: bool,
    pub pausable: bool,
    /// Initialised and disabled, as reported for xStocks: the extension is
    /// present and names no program.
    pub transfer_hook_disabled: bool,
    pub new_accounts_frozen: bool,
    /// Basis points taken from every transfer, with a cap.
    pub transfer_fee: Option<(u16, u64)>,
}

impl Powers {
    /// The extension set reported for xStocks.
    pub fn xstocks() -> Self {
        Self {
            permanent_delegate: true,
            pausable: true,
            transfer_hook_disabled: true,
            ..Self::default()
        }
    }

    fn extensions(&self) -> Vec<ExtensionType> {
        let mut kinds = vec![];
        if self.permanent_delegate {
            kinds.push(ExtensionType::PermanentDelegate);
        }
        if self.pausable {
            kinds.push(ExtensionType::Pausable);
        }
        if self.transfer_hook_disabled {
            kinds.push(ExtensionType::TransferHook);
        }
        if self.new_accounts_frozen {
            kinds.push(ExtensionType::DefaultAccountState);
        }
        if self.transfer_fee.is_some() {
            kinds.push(ExtensionType::TransferFeeConfig);
        }
        kinds
    }
}

pub struct Issuer {
    pub key: Keypair,
}

impl Issuer {
    pub fn new(world: &mut World) -> Self {
        let key = Keypair::new();
        world.svm.airdrop(&key.pubkey(), 1_000_000_000).unwrap();
        Self { key }
    }

    pub fn authority(&self) -> Pubkey {
        self.key.pubkey()
    }

    pub fn create_stock(&self, world: &mut World, powers: Powers) -> Pubkey {
        let mint = Keypair::new();
        let id = token_2022::ID;
        let issuer = self.authority();
        let kinds = powers.extensions();
        let space = ExtensionType::try_calculate_account_len::<Mint>(&kinds).unwrap();

        let mut instructions = vec![system_instruction::create_account(
            &world.payer.pubkey(),
            &mint.pubkey(),
            world.svm.minimum_balance_for_rent_exemption(space),
            space as u64,
            &id,
        )];
        if powers.permanent_delegate {
            instructions
                .push(token::initialize_permanent_delegate(&id, &mint.pubkey(), &issuer).unwrap());
        }
        if powers.pausable {
            instructions.push(pausable::initialize(&id, &mint.pubkey(), &issuer).unwrap());
        }
        if powers.transfer_hook_disabled {
            instructions
                .push(transfer_hook::initialize(&id, &mint.pubkey(), Some(issuer), None).unwrap());
        }
        if let Some((basis_points, cap)) = powers.transfer_fee {
            instructions.push(
                transfer_fee::initialize_transfer_fee_config(
                    &id,
                    &mint.pubkey(),
                    Some(&issuer),
                    Some(&issuer),
                    basis_points,
                    cap,
                )
                .unwrap(),
            );
        }
        if powers.new_accounts_frozen {
            instructions.push(
                initialize_default_account_state(&id, &mint.pubkey(), &AccountState::Frozen)
                    .unwrap(),
            );
        }
        instructions.push(
            token::initialize_mint2(&id, &mint.pubkey(), &issuer, Some(&issuer), STOCK_DECIMALS)
                .unwrap(),
        );

        let outcome = world.send_instructions(&instructions, &[&mint]);
        assert!(outcome.is_ok(), "creating a mock stock failed: {outcome:?}");
        mint.pubkey()
    }

    /// The owner's associated token account for the mint, created if needed.
    pub fn open_account(&self, world: &mut World, owner: Pubkey, mint: Pubkey) -> Pubkey {
        let instruction = create_associated_token_account_idempotent(
            &world.payer.pubkey(),
            &owner,
            &mint,
            &token_2022::ID,
        );
        let outcome = world.send_instructions(&[instruction], &[]);
        assert!(outcome.is_ok(), "opening an account failed: {outcome:?}");
        get_associated_token_address_with_program_id(&owner, &mint, &token_2022::ID)
    }

    /// Mints new tokens into any account. Used to fund holders, and, aimed at
    /// the Hall's account, to pay a dividend as new tokens.
    pub fn mint_to(
        &self,
        world: &mut World,
        mint: Pubkey,
        account: Pubkey,
        amount: u64,
    ) -> Outcome {
        let instruction = token::mint_to(
            &token_2022::ID,
            &mint,
            &account,
            &self.authority(),
            &[],
            amount,
        )
        .unwrap();
        world.send_instructions(&[instruction], &[&self.key])
    }

    pub fn freeze(&self, world: &mut World, mint: Pubkey, account: Pubkey) -> Outcome {
        let instruction =
            token::freeze_account(&token_2022::ID, &account, &mint, &self.authority(), &[])
                .unwrap();
        world.send_instructions(&[instruction], &[&self.key])
    }

    pub fn thaw(&self, world: &mut World, mint: Pubkey, account: Pubkey) -> Outcome {
        let instruction =
            token::thaw_account(&token_2022::ID, &account, &mint, &self.authority(), &[]).unwrap();
        world.send_instructions(&[instruction], &[&self.key])
    }

    pub fn pause(&self, world: &mut World, mint: Pubkey) -> Outcome {
        let instruction = pausable::pause(&token_2022::ID, &mint, &self.authority(), &[]).unwrap();
        world.send_instructions(&[instruction], &[&self.key])
    }

    pub fn resume(&self, world: &mut World, mint: Pubkey) -> Outcome {
        let instruction = pausable::resume(&token_2022::ID, &mint, &self.authority(), &[]).unwrap();
        world.send_instructions(&[instruction], &[&self.key])
    }

    /// Takes tokens out of any account using the permanent delegate.
    pub fn seize(
        &self,
        world: &mut World,
        mint: Pubkey,
        from: Pubkey,
        to: Pubkey,
        amount: u64,
    ) -> Outcome {
        let instruction = token::transfer_checked(
            &token_2022::ID,
            &from,
            &mint,
            &to,
            &self.authority(),
            &[],
            amount,
            STOCK_DECIMALS,
        )
        .unwrap();
        world.send_instructions(&[instruction], &[&self.key])
    }
}
