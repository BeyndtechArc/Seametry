//! An initialised alloy and a second wallet, for tests of every instruction
//! after `initialize_alloy`.

#![allow(dead_code)]

use {
    super::{alloy::*, World},
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::AccountMeta, system_program},
        AccountDeserialize,
    },
    anchor_spl::{token::spl_token, token_2022},
    hall::state::{Claim, CLAIM_SEED},
    solana_keypair::Keypair,
    solana_signer::Signer,
};

pub const CLASSIC_DEPOSIT: u64 = 5_000_001;
pub const MODERN_DEPOSIT: u64 = 3_000_001;

/// What the second wallet holds of each constituent to begin with.
pub const STRIKER_FUNDS: u64 = 1_000_000_000;

/// An alloy initialised by the sponsor with one classic and one Token-2022
/// constituent, and a second wallet holding plenty of both to strike with.
pub struct Fixture {
    pub world: World,
    pub at: Addresses,
    pub striker: Keypair,
    pub striker_shares: Pubkey,
    /// The striker's own token accounts, one per constituent. They fund a
    /// strike and receive a withdrawal.
    pub sources: Vec<Deposit>,
}

impl Fixture {
    pub fn new() -> Self {
        let mut world = World::new();
        let sponsor_deposits = [
            funded(&mut world, spl_token::ID, CLASSIC_DEPOSIT),
            funded(&mut world, token_2022::ID, MODERN_DEPOSIT),
        ];
        let outcome = initialize(&mut world, &sponsor_deposits, amounts(&sponsor_deposits));
        assert!(outcome.is_ok(), "{}", logs(&outcome));

        let at = addresses(world.sponsor());
        let striker = Wallet::new(&mut world, &at, &sponsor_deposits);
        Self {
            world,
            at,
            striker: striker.key,
            striker_shares: striker.shares,
            sources: striker.sources,
        }
    }

    /// Another wallet with its own funds and share account, so tests can have
    /// two owners at once.
    pub fn new_wallet(&mut self) -> Wallet {
        Wallet::new(&mut self.world, &self.at, &self.sources)
    }

    pub fn strike_as(&mut self, wallet: &Wallet, shares: u64) -> Outcome {
        self.world.send_as(
            &wallet.key,
            hall::instruction::Create {
                shares,
                maximums: vec![u64::MAX; wallet.sources.len()],
            },
            hall::accounts::Create {
                caller: wallet.key.pubkey(),
                alloy: self.at.alloy,
                share_mint: self.at.share_mint,
                caller_shares: wallet.shares,
                share_token_program: token_2022::ID,
            },
            leg_accounts(self.at.alloy, &wallet.sources),
        )
    }

    pub fn redeem_as(&mut self, wallet: &Wallet, shares: u64) -> Outcome {
        let owner = wallet.key.pubkey();
        let remaining = self.hall_metas();
        self.world.send_as(
            &wallet.key,
            hall::instruction::Redeem { shares },
            hall::accounts::Redeem {
                caller: owner,
                alloy: self.at.alloy,
                share_mint: self.at.share_mint,
                caller_shares: wallet.shares,
                claim: self.claim_address(owner),
                share_token_program: token_2022::ID,
                system_program: system_program::ID,
            },
            remaining,
        )
    }

    pub fn withdraw_as(&mut self, wallet: &Wallet, leg_index: u8, units: u64) -> Outcome {
        let owner = wallet.key.pubkey();
        let leg = &wallet.sources[leg_index as usize];
        let (mint, token_program, destination) = (leg.mint, leg.program, leg.source);
        self.world.send_as(
            &wallet.key,
            hall::instruction::Withdraw { leg_index, units },
            hall::accounts::Withdraw {
                owner,
                alloy: self.at.alloy,
                claim: self.claim_address(owner),
                mint,
                hall_account: self.hall(leg_index as usize),
                destination,
                token_program,
            },
            vec![],
        )
    }

    pub fn hall(&self, index: usize) -> Pubkey {
        hall_account(self.at.alloy, &self.sources[index])
    }

    pub fn striker_key(&self) -> Pubkey {
        self.striker.pubkey()
    }

    pub fn strike(&mut self, shares: u64, maximums: Vec<u64>) -> Outcome {
        let remaining = leg_accounts(self.at.alloy, &self.sources);
        self.strike_with(
            shares,
            maximums,
            self.at.share_mint,
            self.striker_shares,
            remaining,
        )
    }

    pub fn strike_with(
        &mut self,
        shares: u64,
        maximums: Vec<u64>,
        share_mint: Pubkey,
        caller_shares: Pubkey,
        remaining: Vec<AccountMeta>,
    ) -> Outcome {
        self.world.send_as(
            &self.striker,
            hall::instruction::Create { shares, maximums },
            hall::accounts::Create {
                caller: self.striker.pubkey(),
                alloy: self.at.alloy,
                share_mint,
                caller_shares,
                share_token_program: token_2022::ID,
            },
            remaining,
        )
    }

    /// The Hall's token accounts, the only per-constituent accounts a melt
    /// takes.
    pub fn hall_metas(&self) -> Vec<AccountMeta> {
        (0..self.sources.len())
            .map(|index| AccountMeta::new_readonly(self.hall(index), false))
            .collect()
    }

    pub fn redeem(&mut self, shares: u64) -> Outcome {
        let remaining = self.hall_metas();
        self.redeem_with(shares, self.at.share_mint, self.striker_shares, remaining)
    }

    pub fn redeem_with(
        &mut self,
        shares: u64,
        share_mint: Pubkey,
        caller_shares: Pubkey,
        remaining: Vec<AccountMeta>,
    ) -> Outcome {
        let caller = self.striker.pubkey();
        self.world.send_as(
            &self.striker,
            hall::instruction::Redeem { shares },
            hall::accounts::Redeem {
                caller,
                alloy: self.at.alloy,
                share_mint,
                caller_shares,
                claim: self.claim_address(caller),
                share_token_program: token_2022::ID,
                system_program: system_program::ID,
            },
            remaining,
        )
    }

    pub fn claim_address(&self, owner: Pubkey) -> Pubkey {
        Pubkey::find_program_address(
            &[CLAIM_SEED, self.at.alloy.as_ref(), owner.as_ref()],
            &hall::ID,
        )
        .0
    }

    pub fn claim(&self, owner: Pubkey) -> Claim {
        let account = self
            .world
            .svm
            .get_account(&self.claim_address(owner))
            .unwrap_or_else(|| panic!("{owner} has no claim on this alloy"));
        Claim::try_deserialize(&mut account.data.as_slice()).unwrap()
    }

    pub fn withdraw(&mut self, leg_index: u8, units: u64) -> Outcome {
        let destination = self.sources[leg_index as usize].source;
        self.withdraw_to(leg_index, units, destination)
    }

    pub fn withdraw_to(&mut self, leg_index: u8, units: u64, destination: Pubkey) -> Outcome {
        let leg = &self.sources[leg_index as usize];
        let (mint, token_program) = (leg.mint, leg.program);
        let owner = self.striker.pubkey();
        self.world.send_as(
            &self.striker,
            hall::instruction::Withdraw { leg_index, units },
            hall::accounts::Withdraw {
                owner,
                alloy: self.at.alloy,
                claim: self.claim_address(owner),
                mint,
                hall_account: self.hall(leg_index as usize),
                destination,
                token_program,
            },
            vec![],
        )
    }

    /// Everything a tolerated instruction may move, so a refused one can be
    /// shown to have moved nothing.
    pub fn balances(&self) -> Vec<u64> {
        let mut all = vec![self.world.token_amount(self.striker_shares)];
        for (index, source) in self.sources.iter().enumerate() {
            all.push(self.world.token_amount(source.source));
            all.push(self.world.token_amount(self.hall(index)));
        }
        all
    }

    /// For each leg, whether the Hall's balance equals ledger + pending +
    /// unclaimed. Holds after any instruction that syncs the leg.
    pub fn assert_balances_match_ledgers(&self, context: &str) {
        let alloy = self.world.alloy(self.at.alloy);
        for index in 0..self.sources.len() {
            let leg = alloy.legs[index];
            assert_eq!(
                self.world.token_amount(self.hall(index)),
                leg.ledger + leg.pending + leg.unclaimed,
                "{context}: balance invariant for leg {index}"
            );
        }
    }
}

/// A wallet with lamports, an empty share account, and a funded account for
/// each constituent of the alloy.
pub struct Wallet {
    pub key: Keypair,
    pub shares: Pubkey,
    pub sources: Vec<Deposit>,
}

impl Wallet {
    pub fn new(world: &mut World, at: &Addresses, like: &[Deposit]) -> Self {
        let key = Keypair::new();
        // The first melt creates the caller's claim account and the caller pays
        // its rent, so a wallet that melts needs a little SOL.
        world.svm.airdrop(&key.pubkey(), 1_000_000_000).unwrap();
        let shares = Pubkey::new_unique();
        world.put_token_account_at(shares, token_2022::ID, at.share_mint, key.pubkey(), 0);
        let sources = like
            .iter()
            .map(|leg| {
                let source = Pubkey::new_unique();
                world.put_token_account_at(
                    source,
                    leg.program,
                    leg.mint,
                    key.pubkey(),
                    STRIKER_FUNDS,
                );
                Deposit {
                    mint: leg.mint,
                    source,
                    program: leg.program,
                    amount: 0,
                }
            })
            .collect();
        Self {
            key,
            shares,
            sources,
        }
    }
}
