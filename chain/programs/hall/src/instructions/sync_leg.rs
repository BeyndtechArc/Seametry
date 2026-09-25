use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

use crate::{
    error::HallError,
    events::{SyncKindCode, Synced},
    recipe::{self, SyncKind, SyncOutcome},
    state::{Alloy, LegRecord},
};

#[derive(Accounts)]
pub struct SyncLeg<'info> {
    #[account(mut)]
    pub alloy: AccountLoader<'info, Alloy>,
    pub hall_account: InterfaceAccount<'info, TokenAccount>,
}

/// Reconciles one leg against the balance actually held and stores the result.
/// Shared by every instruction that must sync before it acts.
pub fn reconcile(record: &mut LegRecord, balance: u64, now: i64) -> Result<SyncOutcome> {
    let outcome = recipe::sync(&record.leg(), balance, now)?;
    record.store(&outcome.after);
    Ok(outcome)
}

pub fn handle_sync(ctx: Context<SyncLeg>, leg_index: u8) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let alloy_key = ctx.accounts.alloy.key();
    let mut alloy = ctx.accounts.alloy.load_mut()?;
    let record = alloy
        .record_mut(leg_index as usize)
        .ok_or(HallError::UnknownConstituent)?;
    require_keys_eq!(
        record.hall_account,
        ctx.accounts.hall_account.key(),
        HallError::WrongHallAccount
    );

    let outcome = reconcile(record, ctx.accounts.hall_account.amount, now)?;
    emit!(Synced {
        alloy: alloy_key,
        leg_index,
        kind: match outcome.kind {
            SyncKind::Unchanged => SyncKindCode::Unchanged,
            SyncKind::Credit => SyncKindCode::Credit,
            SyncKind::Deficit => SyncKindCode::Deficit,
        },
        delta: outcome.delta,
        vested_in: outcome.vested_in,
    });
    Ok(())
}
