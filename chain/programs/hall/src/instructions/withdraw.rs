use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use super::sync_leg::reconcile;
use crate::{
    error::HallError,
    events::Withdrawn,
    recipe,
    state::{Alloy, Claim, ALLOY_SEED, CLAIM_SEED},
};

/// Delivers units of one leg of the owner's claim to the owner's own account.
///
/// The claim is settled against every seizure first, so what the owner may take
/// is what the Hall still holds for them. If the issuer has frozen or paused
/// this constituent the transfer fails and the whole instruction reverts, which
/// leaves the claim exactly as it was until the issuer releases it.
#[derive(Accounts)]
pub struct Withdraw<'info> {
    pub owner: Signer<'info>,

    #[account(mut)]
    pub alloy: AccountLoader<'info, Alloy>,

    #[account(
        mut,
        has_one = alloy,
        seeds = [CLAIM_SEED, alloy.key().as_ref(), owner.key().as_ref()],
        bump = claim.bump
    )]
    pub claim: Box<Account<'info, Claim>>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub hall_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = owner,
        token::token_program = token_program,
    )]
    pub destination: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_withdraw(mut ctx: Context<Withdraw>, leg_index: u8, units: u64) -> Result<()> {
    require!(units > 0, HallError::ZeroUnits);
    let accounts = &mut ctx.accounts;
    let alloy_key = accounts.alloy.key();
    let now = Clock::get()?.unix_timestamp;
    let index = leg_index as usize;

    let (sponsor, id, bump, expected_after) = {
        let mut alloy = accounts.alloy.load_mut()?;
        let (sponsor, id, bump) = (alloy.sponsor, alloy.id, alloy.bump);
        let record = alloy
            .record_mut(index)
            .ok_or(HallError::UnknownConstituent)?;
        require!(
            accounts.mint.key() == record.mint
                && accounts.hall_account.key() == record.hall_account
                && accounts.token_program.key() == record.token_program,
            HallError::WrongConstituentAccounts
        );
        reconcile(
            alloy_key,
            leg_index,
            record,
            accounts.hall_account.amount,
            now,
        )?;

        let mut leg = record.leg();
        let entry = &mut accounts.claim.entries[index];
        let after = recipe::withdraw_claim(&entry.claim_leg(), &mut leg, units)?;
        entry.store(&after);
        record.store(&leg);
        (sponsor, id, bump, leg.expected()?)
    };

    transfer_checked(
        CpiContext::new_with_signer(
            accounts.token_program.key(),
            TransferChecked {
                from: accounts.hall_account.to_account_info(),
                mint: accounts.mint.to_account_info(),
                to: accounts.destination.to_account_info(),
                authority: accounts.alloy.to_account_info(),
            },
            &[&[ALLOY_SEED, sponsor.as_ref(), &id.to_le_bytes(), &[bump]]],
        ),
        units,
        accounts.mint.decimals,
    )?;

    accounts.hall_account.reload()?;
    require_eq!(
        accounts.hall_account.amount,
        expected_after,
        HallError::HallBalanceMismatch
    );

    emit!(Withdrawn {
        alloy: alloy_key,
        owner: accounts.owner.key(),
        leg_index,
        units,
    });
    Ok(())
}
