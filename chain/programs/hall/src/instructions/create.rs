use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::Token2022,
    token_interface::{mint_to, Mint, MintTo, TokenAccount},
};

use super::{
    deposit::{deposit, DepositAccounts},
    sync_leg::reconcile,
};
use crate::{
    error::HallError,
    events::Struck,
    recipe,
    state::{Alloy, LegRecord, ACCOUNTS_PER_LEG, ALLOY_SEED},
};

#[derive(Accounts)]
pub struct Create<'info> {
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

    pub share_token_program: Program<'info, Token2022>,
}

/// Strikes exactly `shares`, taking at most `maximums[i]` of each constituent.
///
/// Every leg is synced first, so shares are priced against what the Hall holds
/// now and not against a ledger an issuer has since moved.
pub fn handle_create<'info>(
    ctx: Context<'info, Create<'info>>,
    shares: u64,
    maximums: Vec<u64>,
) -> Result<()> {
    let accounts = &ctx.accounts;
    let alloy_key = accounts.alloy.key();
    let now = Clock::get()?.unix_timestamp;

    let (inputs, supply_after, signer_parts) = {
        let mut alloy = accounts.alloy.load_mut()?;
        let count = alloy.constituent_count as usize;
        require_eq!(
            ctx.remaining_accounts.len(),
            count * ACCOUNTS_PER_LEG,
            HallError::WrongAccountCount
        );
        require_eq!(maximums.len(), count, HallError::WrongMaximumsCount);

        for (index, chunk) in ctx
            .remaining_accounts
            .chunks_exact(ACCOUNTS_PER_LEG)
            .enumerate()
        {
            let record = &mut alloy.legs[index];
            let [mint, _source, hall, program] = chunk else {
                return err!(HallError::WrongAccountCount);
            };
            require!(
                *mint.key == record.mint
                    && *hall.key == record.hall_account
                    && *program.key == record.token_program,
                HallError::WrongConstituentAccounts
            );
            let balance = InterfaceAccount::<TokenAccount>::try_from(hall)?.amount;
            reconcile(alloy_key, index as u8, record, balance, now)?;
        }

        let legs: Vec<recipe::Leg> = alloy.legs[..count].iter().map(LegRecord::leg).collect();
        let inputs = recipe::create_inputs(&legs, alloy.supply, shares, &maximums)?;
        for (record, input) in alloy.legs[..count].iter_mut().zip(&inputs) {
            let mut leg = record.leg();
            recipe::apply_create(&mut leg, *input)?;
            record.store(&leg);
        }
        alloy.supply = alloy
            .supply
            .checked_add(shares)
            .ok_or(HallError::Overflow)?;
        (inputs, alloy.supply, (alloy.sponsor, alloy.id, alloy.bump))
    };

    let caller = accounts.caller.to_account_info();
    for (chunk, input) in ctx
        .remaining_accounts
        .chunks_exact(ACCOUNTS_PER_LEG)
        .zip(&inputs)
    {
        let [mint, source, hall, program] = chunk else {
            return err!(HallError::WrongAccountCount);
        };
        deposit(
            &DepositAccounts {
                caller: caller.clone(),
                mint,
                source,
                hall,
                token_program: program,
            },
            *input,
        )?;
    }

    let (sponsor, id, bump) = signer_parts;
    mint_to(
        CpiContext::new_with_signer(
            accounts.share_token_program.key(),
            MintTo {
                mint: accounts.share_mint.to_account_info(),
                to: accounts.caller_shares.to_account_info(),
                authority: accounts.alloy.to_account_info(),
            },
            &[&[ALLOY_SEED, sponsor.as_ref(), &id.to_le_bytes(), &[bump]]],
        ),
        shares,
    )?;

    emit!(Struck {
        alloy: alloy_key,
        caller: caller.key(),
        shares,
        supply_after,
        inputs
    });
    Ok(())
}
