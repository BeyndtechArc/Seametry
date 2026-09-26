//! An alloy over two mock stocks that carry every issuer power, and a holder
//! who can strike. Shared by the issuer tests and the transcript.

#![allow(dead_code)]

use {
    super::{alloy::*, fixture::*, issuer::*, World},
    anchor_lang::prelude::Pubkey,
    anchor_spl::token_2022,
    solana_keypair::Keypair,
    solana_signer::Signer,
};

pub const FIRST: u64 = 5_000_000;
pub const SECOND: u64 = 3_000_000;
pub const HOLDER_FUNDS: u64 = 1_000_000_000;

/// An alloy over two mock stocks that carry every issuer power, and a holder
/// who has struck 1,000 shares.
pub struct Stage {
    pub fixture: Fixture,
    pub issuer: Issuer,
    pub stocks: [Pubkey; 2],
}

impl Stage {
    pub fn new() -> Self {
        let mut world = World::new();
        let issuer = Issuer::new(&mut world);
        let stocks = [
            issuer.create_stock(&mut world, Powers::xstocks()),
            issuer.create_stock(&mut world, Powers::xstocks()),
        ];

        let sponsor = world.sponsor();
        let sponsor_deposits: Vec<Deposit> = stocks
            .iter()
            .zip([FIRST, SECOND])
            .map(|(&mint, amount)| {
                let source = issuer.open_account(&mut world, sponsor, mint);
                issuer.mint_to(&mut world, mint, source, amount).unwrap();
                Deposit {
                    mint,
                    source,
                    program: token_2022::ID,
                    amount,
                }
            })
            .collect();
        let outcome = initialize(&mut world, &sponsor_deposits, amounts(&sponsor_deposits));
        assert!(outcome.is_ok(), "{}", logs(&outcome));

        let at = addresses(sponsor);
        let holder = Keypair::new();
        world.svm.airdrop(&holder.pubkey(), 1_000_000_000).unwrap();
        let holder_shares = issuer.open_account(&mut world, holder.pubkey(), at.share_mint);
        let sources = stocks
            .iter()
            .map(|&mint| {
                let source = issuer.open_account(&mut world, holder.pubkey(), mint);
                issuer
                    .mint_to(&mut world, mint, source, HOLDER_FUNDS)
                    .unwrap();
                Deposit {
                    mint,
                    source,
                    program: token_2022::ID,
                    amount: 0,
                }
            })
            .collect();

        let mut fixture = Fixture::from_parts(world, at, holder, holder_shares, sources);
        fixture.world.set_clock(1_000);
        Self {
            fixture,
            issuer,
            stocks,
        }
    }

    /// The alloy as `new` leaves it, plus the holder's first strike of 1,000
    /// shares.
    pub fn struck() -> Self {
        let mut stage = Self::new();
        let outcome = stage.fixture.strike(1_000, vec![u64::MAX, u64::MAX]);
        assert!(outcome.is_ok(), "{}", logs(&outcome));
        stage
    }

    pub fn leg(&self, index: usize) -> hall::state::LegRecord {
        self.fixture.world.alloy(self.fixture.at.alloy).legs[index]
    }

    pub fn try_sync(&mut self, index: usize) -> Outcome {
        self.fixture.world.send(
            hall::instruction::Sync {
                leg_index: index as u8,
            },
            hall::accounts::SyncLeg {
                alloy: self.fixture.at.alloy,
                hall_account: self.fixture.hall(index),
            },
        )
    }

    pub fn sync(&mut self, index: usize) {
        let outcome = self.try_sync(index);
        assert!(outcome.is_ok(), "{}", logs(&outcome));
    }
}
