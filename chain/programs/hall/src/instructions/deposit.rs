use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    spl_token_2022::state::AccountState, transfer_checked, Mint, TokenAccount, TransferChecked,
};

use crate::error::HallError;

pub struct DepositAccounts<'info> {
    pub caller: AccountInfo<'info>,
    pub mint: &'info AccountInfo<'info>,
    pub source: &'info AccountInfo<'info>,
    pub hall: &'info AccountInfo<'info>,
    pub token_program: &'info AccountInfo<'info>,
}

/// Moves `amount` from the caller's account into the Hall's, and returns the
/// Hall's balance from before the transfer.
///
/// The Hall must receive exactly `amount`. A mint that takes a transfer fee, or
/// a hook that changes the amount, would otherwise let the ledger record units
/// the Hall never held.
pub fn deposit<'info>(accounts: &DepositAccounts<'info>, amount: u64) -> Result<u64> {
    require_keys_eq!(
        *accounts.mint.owner,
        *accounts.token_program.key,
        HallError::NotAMint
    );
    let mint =
        InterfaceAccount::<Mint>::try_from(accounts.mint).map_err(|_| HallError::NotAMint)?;
    let source = InterfaceAccount::<TokenAccount>::try_from(accounts.source)
        .map_err(|_| HallError::WrongSourceAccount)?;
    require!(
        source.mint == accounts.mint.key() && source.owner == accounts.caller.key(),
        HallError::WrongSourceAccount
    );

    let mut hall = InterfaceAccount::<TokenAccount>::try_from(accounts.hall)?;
    require!(
        hall.state != AccountState::Frozen,
        HallError::HallAccountFrozen
    );
    let before = hall.amount;

    transfer_checked(
        CpiContext::new(
            *accounts.token_program.key,
            TransferChecked {
                from: accounts.source.clone(),
                mint: accounts.mint.clone(),
                to: accounts.hall.clone(),
                authority: accounts.caller.clone(),
            },
        ),
        amount,
        mint.decimals,
    )?;
    hall.reload()?;
    require_eq!(
        hall.amount,
        before.checked_add(amount).ok_or(HallError::Overflow)?,
        HallError::DepositNotReceivedInFull
    );
    Ok(before)
}
