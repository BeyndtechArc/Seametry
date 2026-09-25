use anchor_lang::{prelude::*, system_program};
use anchor_spl::{
    associated_token::{self, AssociatedToken},
    token_2022::Token2022,
    token_interface::{
        mint_to, spl_pod::optional_keys::OptionalNonZeroPubkey,
        spl_token_metadata_interface::state::TokenMetadata, token_metadata_initialize,
        token_metadata_update_authority, Mint, MintTo, TokenAccount, TokenMetadataInitialize,
        TokenMetadataUpdateAuthority,
    },
};

use super::deposit::{self, DepositAccounts};
use crate::{
    error::HallError,
    events::AlloyInitialized,
    state::{
        Alloy, LegRecord, ACCOUNTS_PER_LEG, ALLOY_SEED, LOCKED_SEED, MAX_CONSTITUENTS,
        PROGRAM_VERSION, SHARE_DECIMALS, SHARE_SEED,
    },
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeAlloyArgs {
    pub id: u64,
    pub sponsor_mark: [u8; 32],
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub genesis_shares: u64,
    /// One entry per constituent, in the order their accounts follow.
    pub deposits: Vec<u64>,
}

#[derive(Accounts)]
#[instruction(args: InitializeAlloyArgs)]
pub struct InitializeAlloy<'info> {
    #[account(mut)]
    pub sponsor: Signer<'info>,

    #[account(
        init,
        payer = sponsor,
        space = 8 + core::mem::size_of::<Alloy>(),
        seeds = [ALLOY_SEED, sponsor.key().as_ref(), &args.id.to_le_bytes()],
        bump
    )]
    pub alloy: AccountLoader<'info, Alloy>,

    /// No freeze authority, and the metadata pointer has no authority: the
    /// only extension is a pointer at the mint itself. The alloy holds the mint
    /// authority and only `create` signs with it.
    #[account(
        init,
        payer = sponsor,
        seeds = [SHARE_SEED, alloy.key().as_ref()],
        bump,
        mint::decimals = SHARE_DECIMALS,
        mint::authority = alloy,
        mint::token_program = share_token_program,
        extensions::metadata_pointer::metadata_address = share_mint,
    )]
    pub share_mint: Box<InterfaceAccount<'info, Mint>>,

    /// Holds the genesis shares. Nothing in the program moves shares out of it.
    #[account(
        init,
        payer = sponsor,
        seeds = [LOCKED_SEED, alloy.key().as_ref()],
        bump,
        token::mint = share_mint,
        token::authority = alloy,
        token::token_program = share_token_program,
    )]
    pub locked_shares: Box<InterfaceAccount<'info, TokenAccount>>,

    pub share_token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_alloy<'info>(
    ctx: Context<'info, InitializeAlloy<'info>>,
    args: InitializeAlloyArgs,
) -> Result<()> {
    let count = args.deposits.len();
    require!(
        (1..=MAX_CONSTITUENTS).contains(&count),
        HallError::ConstituentCountOutOfRange
    );
    require_eq!(
        ctx.remaining_accounts.len(),
        count * ACCOUNTS_PER_LEG,
        HallError::WrongAccountCount
    );
    require!(
        args.genesis_shares > 0 && args.deposits.iter().all(|&deposit| deposit > 0),
        HallError::ZeroDeposit
    );

    let accounts = &ctx.accounts;
    let alloy_key = accounts.alloy.key();
    let sponsor_key = accounts.sponsor.key();
    let bump = [ctx.bumps.alloy];
    let id = args.id.to_le_bytes();
    let signer: &[&[&[u8]]] = &[&[ALLOY_SEED, sponsor_key.as_ref(), &id, &bump]];
    let now = Clock::get()?.unix_timestamp;

    initialize_share_metadata(accounts, alloy_key, signer, &args)?;
    mint_to(
        CpiContext::new_with_signer(
            accounts.share_token_program.key(),
            MintTo {
                mint: accounts.share_mint.to_account_info(),
                to: accounts.locked_shares.to_account_info(),
                authority: accounts.alloy.to_account_info(),
            },
            signer,
        ),
        args.genesis_shares,
    )?;

    let mut records = [LegRecord::default(); MAX_CONSTITUENTS];
    for (index, (chunk, &deposit)) in ctx
        .remaining_accounts
        .chunks_exact(ACCOUNTS_PER_LEG)
        .zip(&args.deposits)
        .enumerate()
    {
        records[index] = admit_constituent(accounts, chunk, deposit, now)?;
        require!(
            records[..index]
                .iter()
                .all(|earlier| earlier.mint != records[index].mint),
            HallError::DuplicateConstituent
        );
    }

    let mut alloy = accounts.alloy.load_init()?;
    alloy.sponsor = sponsor_key;
    alloy.sponsor_mark = args.sponsor_mark;
    alloy.share_mint = accounts.share_mint.key();
    alloy.id = args.id;
    alloy.version = PROGRAM_VERSION;
    alloy.created_at = now;
    alloy.supply = args.genesis_shares;
    alloy.locked_genesis = args.genesis_shares;
    alloy.constituent_count = count as u64;
    alloy.bump = bump[0];
    alloy.legs = records;

    emit!(AlloyInitialized {
        alloy: alloy_key,
        sponsor: sponsor_key,
        share_mint: accounts.share_mint.key(),
        id: args.id,
        constituent_count: count as u8,
        genesis_shares: args.genesis_shares,
    });
    Ok(())
}

/// Writes the name, symbol and uri, then gives up the update authority, so a
/// holder can verify on chain that nobody can change them later.
fn initialize_share_metadata<'info>(
    accounts: &InitializeAlloy<'info>,
    alloy_key: Pubkey,
    signer: &[&[&[u8]]],
    args: &InitializeAlloyArgs,
) -> Result<()> {
    let mint_info = accounts.share_mint.to_account_info();
    let metadata = TokenMetadata {
        update_authority: OptionalNonZeroPubkey::try_from(Some(alloy_key))?,
        mint: accounts.share_mint.key(),
        name: args.name.clone(),
        symbol: args.symbol.clone(),
        uri: args.uri.clone(),
        additional_metadata: vec![],
    };
    let needed = Rent::get()?.minimum_balance(mint_info.data_len() + metadata.tlv_size_of()?);
    let shortfall = needed.saturating_sub(mint_info.lamports());
    if shortfall > 0 {
        system_program::transfer(
            CpiContext::new(
                accounts.system_program.key(),
                system_program::Transfer {
                    from: accounts.sponsor.to_account_info(),
                    to: mint_info.clone(),
                },
            ),
            shortfall,
        )?;
    }

    let token_program = accounts.share_token_program.key();
    token_metadata_initialize(
        CpiContext::new_with_signer(
            token_program,
            TokenMetadataInitialize {
                program_id: accounts.share_token_program.to_account_info(),
                metadata: mint_info.clone(),
                update_authority: accounts.alloy.to_account_info(),
                mint_authority: accounts.alloy.to_account_info(),
                mint: mint_info.clone(),
            },
            signer,
        ),
        args.name.clone(),
        args.symbol.clone(),
        args.uri.clone(),
    )?;
    token_metadata_update_authority(
        CpiContext::new_with_signer(
            token_program,
            TokenMetadataUpdateAuthority {
                program_id: accounts.share_token_program.to_account_info(),
                metadata: mint_info,
                current_authority: accounts.alloy.to_account_info(),
                new_authority: accounts.alloy.to_account_info(),
            },
            signer,
        ),
        OptionalNonZeroPubkey::default(),
    )
}

/// Creates the Hall's account for one constituent, takes the sponsor's deposit
/// into it, and returns the leg that records it.
///
/// The Hall's account is the alloy's associated token account, whose address
/// anyone can predict, so it may already hold tokens. Those go to `pending` and
/// vest like any donation, which keeps the balance equal to
/// `ledger + pending + unclaimed` from the first instruction.
fn admit_constituent<'info>(
    accounts: &InitializeAlloy<'info>,
    chunk: &'info [AccountInfo<'info>],
    amount: u64,
    now: i64,
) -> Result<LegRecord> {
    let [mint_info, source_info, hall_info, program_info] = chunk else {
        return err!(HallError::WrongAccountCount);
    };
    require!(
        *program_info.key == anchor_spl::token::ID
            || *program_info.key == anchor_spl::token_2022::ID,
        HallError::UnsupportedTokenProgram
    );

    associated_token::create_idempotent(CpiContext::new(
        accounts.associated_token_program.key(),
        associated_token::Create {
            payer: accounts.sponsor.to_account_info(),
            associated_token: hall_info.clone(),
            authority: accounts.alloy.to_account_info(),
            mint: mint_info.clone(),
            system_program: accounts.system_program.to_account_info(),
            token_program: program_info.clone(),
        },
    ))?;

    let before = deposit::deposit(
        &DepositAccounts {
            caller: accounts.sponsor.to_account_info(),
            mint: mint_info,
            source: source_info,
            hall: hall_info,
            token_program: program_info,
        },
        amount,
    )?;

    Ok(LegRecord {
        mint: mint_info.key(),
        token_program: *program_info.key,
        hall_account: hall_info.key(),
        ledger: amount,
        pending: before,
        unclaimed: 0,
        vest_start: now,
    })
}
