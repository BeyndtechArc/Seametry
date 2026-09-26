use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::Token2022,
    token_interface::{burn, Burn, Mint, TokenAccount},
};

use super::sync_leg::reconcile;
use crate::{
    error::HallError,
    events::Redeemed,
    recipe,
    state::{Alloy, Claim, LegRecord, CLAIM_SEED},
};

/// Burns shares and credits the caller's claim with every leg.
///
/// The accounts are the alloy, the share mint and token program, and one token
/// account per constituent that the Hall already holds. No constituent mint and
/// no constituent token program is among them, and nothing here invokes one.
/// That is what makes a melt impossible for an issuer to block: a freeze, a
/// pause or a hook can stop a leg being delivered later, and cannot reach this.
#[derive(Accounts)]
pub struct Redeem<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(mut, has_one = share_mint @ HallError::WrongShareMint)]
    pub alloy: AccountLoader<'info, Alloy>,

    #[account(mut, mint::token_program = share_token_program)]
    pub share_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        token::mint = share_mint,
        token::authority = caller,
        token::token_program = share_token_program,
    )]
    pub caller_shares: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = caller,
        space = 8 + Claim::INIT_SPACE,
        seeds = [CLAIM_SEED, alloy.key().as_ref(), caller.key().as_ref()],
        bump
    )]
    pub claim: Box<Account<'info, Claim>>,

    pub share_token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn handle_redeem<'info>(mut ctx: Context<'info, Redeem<'info>>, shares: u64) -> Result<()> {
    let accounts = &mut ctx.accounts;
    let alloy_key = accounts.alloy.key();
    let now = Clock::get()?.unix_timestamp;

    let (legs, supply_after) = {
        let mut alloy = accounts.alloy.load_mut()?;
        let count = alloy.constituent_count as usize;
        require_eq!(
            ctx.remaining_accounts.len(),
            count,
            HallError::WrongAccountCount
        );

        for (index, hall) in ctx.remaining_accounts.iter().enumerate() {
            let record = &mut alloy.legs[index];
            require_keys_eq!(hall.key(), record.hall_account, HallError::WrongHallAccount);
            let balance = InterfaceAccount::<TokenAccount>::try_from(hall)?.amount;
            reconcile(alloy_key, index as u8, record, balance, now)?;
        }

        let synced: Vec<recipe::Leg> = alloy.legs[..count].iter().map(LegRecord::leg).collect();
        let legs = recipe::redeem_legs(&synced, alloy.supply, shares)?;

        let claim = &mut accounts.claim;
        if claim.owner == Pubkey::default() {
            claim.alloy = alloy_key;
            claim.owner = accounts.caller.key();
            claim.bump = ctx.bumps.claim;
        }
        for (index, units) in legs.iter().enumerate() {
            let record = &mut alloy.legs[index];
            let mut leg = record.leg();
            recipe::apply_redeem(&mut leg, *units)?;
            let credited = recipe::credit_claim(&claim.entries[index].claim_leg(), &leg, *units)?;
            record.store(&leg);
            claim.entries[index].store(&credited);
        }
        alloy.supply -= shares;
        (legs, alloy.supply)
    };

    burn(
        CpiContext::new(
            accounts.share_token_program.key(),
            Burn {
                mint: accounts.share_mint.to_account_info(),
                from: accounts.caller_shares.to_account_info(),
                authority: accounts.caller.to_account_info(),
            },
        ),
        shares,
    )?;

    emit!(Redeemed {
        alloy: alloy_key,
        caller: accounts.caller.key(),
        shares,
        supply_after,
        legs,
    });
    Ok(())
}
