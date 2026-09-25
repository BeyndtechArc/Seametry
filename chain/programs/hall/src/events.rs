use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum SyncKindCode {
    Unchanged,
    Credit,
    Deficit,
}

#[event]
pub struct Synced {
    pub alloy: Pubkey,
    pub leg_index: u8,
    pub kind: SyncKindCode,
    pub delta: u64,
    pub vested_in: u64,
}
