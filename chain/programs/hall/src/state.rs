use anchor_lang::prelude::*;

use crate::recipe;

pub const MAX_CONSTITUENTS: usize = 12;

/// Accounts an instruction takes per constituent, in order: mint, the caller's
/// token account, the Hall's token account, the token program.
pub const ACCOUNTS_PER_LEG: usize = 4;

pub const ALLOY_SEED: &[u8] = b"alloy";
pub const SHARE_SEED: &[u8] = b"share";
pub const LOCKED_SEED: &[u8] = b"locked";
pub const PROGRAM_VERSION: u64 = 1;

/// Shares carry six decimals so a wallet can show a fraction of one. The
/// arithmetic treats the mint's smallest unit as the share; a whole UI share is
/// one million of them.
pub const SHARE_DECIMALS: u8 = 6;

/// One constituent's position. Mirrors `recipe::Leg` plus the accounts that
/// identify it. Zero-copy: twelve of these do not fit on the SBF stack as an
/// ordinary deserialised account.
#[zero_copy]
#[derive(Default)]
pub struct LegRecord {
    pub mint: Pubkey,
    pub token_program: Pubkey,
    pub hall_account: Pubkey,
    pub ledger: u64,
    pub pending: u64,
    pub unclaimed: u64,
    pub vest_start: i64,
}

impl LegRecord {
    pub fn leg(&self) -> recipe::Leg {
        recipe::Leg {
            ledger: self.ledger,
            pending: self.pending,
            unclaimed: self.unclaimed,
            vest_start: self.vest_start,
        }
    }

    pub fn store(&mut self, leg: &recipe::Leg) {
        self.ledger = leg.ledger;
        self.pending = leg.pending;
        self.unclaimed = leg.unclaimed;
        self.vest_start = leg.vest_start;
    }
}

/// One basket instance. Its address is derived from the sponsor and an id the
/// sponsor chooses, so anyone can initialize an alloy without permission.
#[account(zero_copy)]
pub struct Alloy {
    pub sponsor: Pubkey,
    pub sponsor_mark: [u8; 32],
    pub share_mint: Pubkey,
    pub id: u64,
    pub version: u64,
    pub created_at: i64,
    pub supply: u64,
    pub locked_genesis: u64,
    pub constituent_count: u64,
    pub bump: u8,
    pub _reserved: [u8; 7],
    pub legs: [LegRecord; MAX_CONSTITUENTS],
}

impl Alloy {
    pub fn record(&self, index: usize) -> Option<&LegRecord> {
        if index < self.constituent_count as usize {
            self.legs.get(index)
        } else {
            None
        }
    }

    pub fn record_mut(&mut self, index: usize) -> Option<&mut LegRecord> {
        if index < self.constituent_count as usize {
            self.legs.get_mut(index)
        } else {
            None
        }
    }
}
