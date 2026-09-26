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
    pub vest_end: i64,
    /// The claim index as two halves, because a u128 would force 16 byte
    /// alignment on a zero-copy struct. Both zero means unset.
    pub claim_index_low: u64,
    pub claim_index_high: u64,
    pub claim_epoch: u64,
}

impl LegRecord {
    pub fn leg(&self) -> recipe::Leg {
        recipe::Leg {
            ledger: self.ledger,
            pending: self.pending,
            unclaimed: self.unclaimed,
            vest_start: self.vest_start,
            vest_end: self.vest_end,
            claim_index: (u128::from(self.claim_index_high) << 64)
                | u128::from(self.claim_index_low),
            claim_epoch: self.claim_epoch,
        }
    }

    pub fn store(&mut self, leg: &recipe::Leg) {
        self.ledger = leg.ledger;
        self.pending = leg.pending;
        self.unclaimed = leg.unclaimed;
        self.vest_start = leg.vest_start;
        self.vest_end = leg.vest_end;
        self.claim_index_low = leg.claim_index as u64;
        self.claim_index_high = (leg.claim_index >> 64) as u64;
        self.claim_epoch = leg.claim_epoch;
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

pub const CLAIM_SEED: &[u8] = b"claim";

/// One constituent's slot in a claim: the units owed and the leg index and
/// epoch they were last settled against. Mirrors `recipe::ClaimLeg`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace)]
pub struct ClaimEntry {
    pub units: u64,
    pub index: u128,
    pub epoch: u64,
}

impl ClaimEntry {
    pub fn claim_leg(&self) -> recipe::ClaimLeg {
        recipe::ClaimLeg {
            units: self.units,
            index: self.index,
            epoch: self.epoch,
        }
    }

    pub fn store(&mut self, claim: &recipe::ClaimLeg) {
        self.units = claim.units;
        self.index = claim.index;
        self.epoch = claim.epoch;
    }
}

/// What one owner is owed by one alloy after melting: a slot per constituent,
/// in the alloy's order.
#[account]
#[derive(InitSpace)]
pub struct Claim {
    pub alloy: Pubkey,
    pub owner: Pubkey,
    pub bump: u8,
    pub entries: [ClaimEntry; MAX_CONSTITUENTS],
}
