use anchor_lang::prelude::*;

/// What a sync found. A balance that matched what the Hall expected emits no
/// event.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum SyncKindCode {
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

#[event]
pub struct AlloyInitialized {
    pub alloy: Pubkey,
    pub sponsor: Pubkey,
    pub share_mint: Pubkey,
    pub id: u64,
    pub constituent_count: u8,
    pub genesis_shares: u64,
}

#[event]
pub struct Struck {
    pub alloy: Pubkey,
    pub caller: Pubkey,
    pub shares: u64,
    pub supply_after: u64,
    pub inputs: Vec<u64>,
}
