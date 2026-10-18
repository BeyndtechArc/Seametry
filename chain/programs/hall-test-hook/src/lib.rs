//! Test only, never deployed. A transfer hook an issuer can switch on, as
//! xStocks mints carry one initialised and pointing at no program. It needs
//! one account the token program can only find through the hook's extra
//! account list, a gate, and it refuses every transfer while the gate's first
//! byte is not 1. The Hall's tests use it to prove a delivery carries a
//! hook's accounts, and that a hook refusing leaves the leg a claim.

use anchor_lang::prelude::*;
use spl_discriminator::SplDiscriminate;
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

declare_id!("FajxGQM3wz7frvf3WShtNC4YaPQQ78ZAiorEchjSTPM6");

#[program]
pub mod hall_test_hook {
    use super::*;

    #[instruction(discriminator = ExecuteInstruction::SPL_DISCRIMINATOR_SLICE)]
    pub fn execute(ctx: Context<Execute>, _amount: u64) -> Result<()> {
        let open = ctx.accounts.gate.try_borrow_data()?.first() == Some(&1);
        require!(open, HookError::GateClosed);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Execute<'info> {
    /// CHECK: the transfer's source, checked by the token program.
    pub source: UncheckedAccount<'info>,
    /// CHECK: the mint, checked by the token program.
    pub mint: UncheckedAccount<'info>,
    /// CHECK: the transfer's destination, checked by the token program.
    pub destination: UncheckedAccount<'info>,
    /// CHECK: the transfer's authority, checked by the token program.
    pub authority: UncheckedAccount<'info>,
    /// CHECK: the hook's extra account list, at the address the interface derives.
    #[account(seeds = [b"extra-account-metas", mint.key().as_ref()], bump)]
    pub extra_account_metas: UncheckedAccount<'info>,
    /// CHECK: the gate the extra account list names; only its first byte is read.
    pub gate: UncheckedAccount<'info>,
}

#[error_code]
pub enum HookError {
    #[msg("The test hook's gate is closed, so it refuses this transfer.")]
    GateClosed,
}
