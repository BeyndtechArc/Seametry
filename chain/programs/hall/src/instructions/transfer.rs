use anchor_lang::{prelude::*, solana_program::program::invoke_signed};
use anchor_spl::token_2022::spl_token_2022::{
    extension::{transfer_hook, StateWithExtensions},
    instruction::transfer_checked,
    state::Mint as MintState,
};
use spl_transfer_hook_interface::onchain::add_extra_accounts_for_execute_cpi;

/// The transfer hook program a Token-2022 mint names, if it names one. A
/// classic Token mint has no extensions, and a hook initialized with no
/// program, as xStocks mints were reported to carry, needs nothing extra.
fn hook_program(mint: &AccountInfo) -> Result<Option<Pubkey>> {
    if *mint.owner != anchor_spl::token_2022::ID {
        return Ok(None);
    }
    let data = mint.try_borrow_data()?;
    let state = StateWithExtensions::<MintState>::unpack(&data)?;
    Ok(transfer_hook::get_program_id(&state))
}

/// Moves `amount` with `transfer_checked`, carrying the extra accounts a
/// transfer hook needs. Anchor's own `transfer_checked` passes exactly four
/// accounts, so against a mint whose issuer has switched its hook on, every
/// deposit and every delivery would fail; that is the defect this replaces
/// (docs/decisions/2026-10-18-hall-pre-audit-fixes.md).
///
/// `extra` is every additional account the caller sent. The hook interface
/// picks out the hook's validation account and the accounts it lists by
/// address, so one slice can serve every leg of an instruction, and a mint
/// with no hook ignores it.
#[allow(clippy::too_many_arguments)]
pub fn transfer<'info>(
    token_program: &AccountInfo<'info>,
    source: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    destination: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    amount: u64,
    decimals: u8,
    extra: &[AccountInfo<'info>],
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let mut instruction = transfer_checked(
        token_program.key,
        source.key,
        mint.key,
        destination.key,
        authority.key,
        &[],
        amount,
        decimals,
    )?;
    let mut infos = vec![
        source.clone(),
        mint.clone(),
        destination.clone(),
        authority.clone(),
    ];
    if let Some(program) = hook_program(mint)? {
        add_extra_accounts_for_execute_cpi(
            &mut instruction,
            &mut infos,
            &program,
            source.clone(),
            mint.clone(),
            destination.clone(),
            authority.clone(),
            amount,
            extra,
        )?;
    }
    invoke_signed(&instruction, &infos, signer_seeds)?;
    Ok(())
}
