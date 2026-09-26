//! Runs the Hall demonstration of HALL.md section 7 against a deployed devnet
//! program, over real transactions, and writes
//! evidence/hall-demo/transcript-devnet.json in the same shape
//! demo_transcript.rs writes for litesvm, so tools/explorer/hall.go renders
//! both without change.
//!
//! Every account-building and instruction-building call mirrors
//! chain/programs/hall/tests/common/{alloy,issuer}.rs exactly; only the
//! transport differs, litesvm's in-process call becomes a signed transaction
//! sent to a cluster and confirmed before the next step reads its result.
//!
//! Each scenario after founding gets its own alloy, over the same two mock
//! stocks, matching demo_transcript.rs's Stage::new()/Stage::struck() split:
//! a scenario's own founding and first strike happen silently as setup, not
//! as steps the scenario shows, so one scenario's melts and withdrawals can
//! never leave another short of shares to melt. The first version of this
//! tool shared one alloy across every scenario; a real devnet run of it
//! showed a melt refused for insufficient funds in the seizure scenario, an
//! artifact of the sharing, not of anything the scenario was meant to show.
//!
//! Usage: RPC_URL and DEPLOYER_KEYPAIR env vars, both required so a stray
//! default can never point this at the wrong wallet or the wrong cluster.
//!   RPC_URL=https://api.devnet.solana.com \
//!   DEPLOYER_KEYPAIR=$HOME/.config/solana/seametry-devnet-deployer.json \
//!   cargo run --release

mod rpc;

use anchor_lang::{
    prelude::Pubkey,
    solana_program::{instruction::Instruction, system_instruction, system_program},
    AccountDeserialize, Discriminator, InstructionData, Space, ToAccountMetas,
};
use anchor_spl::{
    associated_token::{
        get_associated_token_address_with_program_id,
        spl_associated_token_account::instruction::create_associated_token_account_idempotent,
    },
    token_2022,
    token_interface::spl_token_2022::{
        extension::{
            default_account_state::instruction::initialize_default_account_state,
            pausable::instruction as pausable, transfer_fee::instruction as transfer_fee,
            transfer_hook::instruction as transfer_hook, ExtensionType,
        },
        instruction as token,
        state::AccountState,
    },
};
use hall::{
    instructions::InitializeAlloyArgs,
    recipe::{self, VEST_WINDOW_SECONDS},
    state::{Alloy, Claim, ALLOY_SEED, CLAIM_SEED, LOCKED_SEED, SHARE_SEED},
};
use rpc::Rpc;
use serde::Serialize;
use solana_keypair::Keypair;
use solana_message::Message;
use solana_signer::Signer as SolanaSigner;
use solana_transaction::versioned::VersionedTransaction;
use std::{fs, path::Path};

const STOCK_DECIMALS: u8 = 6;
const FIRST_DEPOSIT: u64 = 5_000_000;
const SECOND_DEPOSIT: u64 = 3_000_000;
const HOLDER_FUNDS: u64 = 1_000_000_000;
const GENESIS_SHARES: u64 = 1_000_000;
const OUTPUT: &str = "../../../evidence/hall-demo/transcript-devnet.json";

/// A signed, ready-to-send transaction over one or more instructions, and the
/// run loop that turns it into a confirmed step or a refusal.
struct World<'a> {
    rpc: &'a Rpc,
    payer: &'a Keypair,
}

impl<'a> World<'a> {
    fn send(&self, ix: Instruction, extra_signers: &[&Keypair]) -> Result<String, String> {
        self.send_many(&[ix], extra_signers)
    }

    fn send_many(&self, ixs: &[Instruction], extra_signers: &[&Keypair]) -> Result<String, String> {
        let blockhash = self.rpc.latest_blockhash();
        let message = Message::new_with_blockhash(ixs, Some(&self.payer.pubkey()), &blockhash);
        let mut signers: Vec<&Keypair> = vec![self.payer];
        signers.extend_from_slice(extra_signers);
        let tx = VersionedTransaction::try_new(
            solana_message::VersionedMessage::Legacy(message),
            &signers,
        )
        .map_err(|e| format!("signing failed: {e}"))?;
        let wire = bincode::serialize(&tx).expect("transaction serialization cannot fail");
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            self.rpc.send_and_confirm(&wire)
        }))
        .map_err(panic_message)
    }
}

/// `catch_unwind`'s `Err` is `Box<dyn Any + Send>`. `Rpc::call` and
/// `Rpc::send_and_confirm` panic with a `String` (every panic here uses format
/// arguments, which always produces one), so the payload is downcast by value
/// rather than re-borrowed, which is the reliable way to read it back out.
fn panic_message(payload: Box<dyn std::any::Any + Send>) -> String {
    match payload.downcast::<String>() {
        Ok(s) => *s,
        Err(payload) => match payload.downcast::<&str>() {
            Ok(s) => s.to_string(),
            Err(_) => "unknown failure".to_string(),
        },
    }
}

fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &hall::ID).0
}

fn rpc_url() -> String {
    std::env::var("RPC_URL").expect("RPC_URL must be set")
}

// --- Mock issuer, mirroring tests/common/issuer.rs -------------------------

#[derive(Clone, Copy, Default)]
struct Powers {
    permanent_delegate: bool,
    pausable: bool,
    transfer_hook_disabled: bool,
    new_accounts_frozen: bool,
    transfer_fee: Option<(u16, u64)>,
}

impl Powers {
    fn xstocks() -> Self {
        Self {
            permanent_delegate: true,
            pausable: true,
            transfer_hook_disabled: true,
            ..Self::default()
        }
    }
    fn extensions(&self) -> Vec<ExtensionType> {
        let mut kinds = vec![];
        if self.permanent_delegate {
            kinds.push(ExtensionType::PermanentDelegate);
        }
        if self.pausable {
            kinds.push(ExtensionType::Pausable);
        }
        if self.transfer_hook_disabled {
            kinds.push(ExtensionType::TransferHook);
        }
        if self.new_accounts_frozen {
            kinds.push(ExtensionType::DefaultAccountState);
        }
        if self.transfer_fee.is_some() {
            kinds.push(ExtensionType::TransferFeeConfig);
        }
        kinds
    }
}

fn create_stock(world: &World, issuer: &Keypair, powers: Powers) -> Result<Pubkey, String> {
    let mint = Keypair::new();
    let id = token_2022::ID;
    let authority = issuer.pubkey();
    let space = ExtensionType::try_calculate_account_len::<
        anchor_spl::token_interface::spl_token_2022::state::Mint,
    >(&powers.extensions())
    .expect("extension layout is always calculable for a fixed extension set");
    let rent = world.rpc.minimum_balance_for_rent_exemption(space);

    let mut ixs = vec![system_instruction::create_account(
        &world.payer.pubkey(),
        &mint.pubkey(),
        rent,
        space as u64,
        &id,
    )];
    if powers.permanent_delegate {
        ixs.push(token::initialize_permanent_delegate(&id, &mint.pubkey(), &authority).unwrap());
    }
    if powers.pausable {
        ixs.push(pausable::initialize(&id, &mint.pubkey(), &authority).unwrap());
    }
    if powers.transfer_hook_disabled {
        ixs.push(transfer_hook::initialize(&id, &mint.pubkey(), Some(authority), None).unwrap());
    }
    if let Some((bps, cap)) = powers.transfer_fee {
        ixs.push(
            transfer_fee::initialize_transfer_fee_config(
                &id,
                &mint.pubkey(),
                Some(&authority),
                Some(&authority),
                bps,
                cap,
            )
            .unwrap(),
        );
    }
    if powers.new_accounts_frozen {
        ixs.push(
            initialize_default_account_state(&id, &mint.pubkey(), &AccountState::Frozen).unwrap(),
        );
    }
    ixs.push(
        token::initialize_mint2(
            &id,
            &mint.pubkey(),
            &authority,
            Some(&authority),
            STOCK_DECIMALS,
        )
        .unwrap(),
    );

    world.send_many(&ixs, &[&mint])?;
    Ok(mint.pubkey())
}

fn open_account(world: &World, owner: Pubkey, mint: Pubkey) -> Result<Pubkey, String> {
    let ix = create_associated_token_account_idempotent(
        &world.payer.pubkey(),
        &owner,
        &mint,
        &token_2022::ID,
    );
    world.send(ix, &[])?;
    Ok(get_associated_token_address_with_program_id(
        &owner,
        &mint,
        &token_2022::ID,
    ))
}

fn mint_to(
    world: &World,
    issuer: &Keypair,
    mint: Pubkey,
    account: Pubkey,
    amount: u64,
) -> Result<String, String> {
    let ix = token::mint_to(
        &token_2022::ID,
        &mint,
        &account,
        &issuer.pubkey(),
        &[],
        amount,
    )
    .unwrap();
    world.send(ix, &[issuer])
}

fn freeze(
    world: &World,
    issuer: &Keypair,
    mint: Pubkey,
    account: Pubkey,
) -> Result<String, String> {
    let ix =
        token::freeze_account(&token_2022::ID, &account, &mint, &issuer.pubkey(), &[]).unwrap();
    world.send(ix, &[issuer])
}

fn thaw(world: &World, issuer: &Keypair, mint: Pubkey, account: Pubkey) -> Result<String, String> {
    let ix = token::thaw_account(&token_2022::ID, &account, &mint, &issuer.pubkey(), &[]).unwrap();
    world.send(ix, &[issuer])
}

fn pause(world: &World, issuer: &Keypair, mint: Pubkey) -> Result<String, String> {
    world.send(
        pausable::pause(&token_2022::ID, &mint, &issuer.pubkey(), &[]).unwrap(),
        &[issuer],
    )
}

fn resume(world: &World, issuer: &Keypair, mint: Pubkey) -> Result<String, String> {
    world.send(
        pausable::resume(&token_2022::ID, &mint, &issuer.pubkey(), &[]).unwrap(),
        &[issuer],
    )
}

fn seize(
    world: &World,
    issuer: &Keypair,
    mint: Pubkey,
    from: Pubkey,
    to: Pubkey,
    amount: u64,
) -> Result<String, String> {
    let ix = token::transfer_checked(
        &token_2022::ID,
        &from,
        &mint,
        &to,
        &issuer.pubkey(),
        &[],
        amount,
        STOCK_DECIMALS,
    )
    .unwrap();
    world.send(ix, &[issuer])
}

// --- Alloy operations, mirroring tests/common/{alloy,fixture}.rs -----------

struct Deposit {
    mint: Pubkey,
    source: Pubkey,
    program: Pubkey,
}

struct Addresses {
    alloy: Pubkey,
    share_mint: Pubkey,
    locked: Pubkey,
}

fn addresses(sponsor: Pubkey, id: u64) -> Addresses {
    let alloy = pda(&[ALLOY_SEED, sponsor.as_ref(), &id.to_le_bytes()]);
    Addresses {
        alloy,
        share_mint: pda(&[SHARE_SEED, alloy.as_ref()]),
        locked: pda(&[LOCKED_SEED, alloy.as_ref()]),
    }
}

fn claim_address(alloy: Pubkey, owner: Pubkey) -> Pubkey {
    pda(&[CLAIM_SEED, alloy.as_ref(), owner.as_ref()])
}

fn hall_account(alloy: Pubkey, deposit: &Deposit) -> Pubkey {
    get_associated_token_address_with_program_id(&alloy, &deposit.mint, &deposit.program)
}

fn leg_metas(
    alloy: Pubkey,
    deposits: &[Deposit],
) -> Vec<anchor_lang::solana_program::instruction::AccountMeta> {
    use anchor_lang::solana_program::instruction::AccountMeta;
    deposits
        .iter()
        .flat_map(|d| {
            [
                AccountMeta::new_readonly(d.mint, false),
                AccountMeta::new(d.source, false),
                AccountMeta::new(hall_account(alloy, d), false),
                AccountMeta::new_readonly(d.program, false),
            ]
        })
        .collect()
}

fn initialize_alloy(
    world: &World,
    sponsor: Pubkey,
    id: u64,
    deposits: &[Deposit],
    amounts: Vec<u64>,
) -> Result<(Addresses, String), String> {
    let at = addresses(sponsor, id);
    let mut ix = Instruction::new_with_bytes(
        hall::ID,
        &hall::instruction::InitializeAlloy {
            args: InitializeAlloyArgs {
                id,
                sponsor_mark: [9; 32],
                name: format!("Alloy No. {id}"),
                symbol: "ALY1".to_string(),
                uri: "https://seametry.example/alloy".to_string(),
                genesis_shares: GENESIS_SHARES,
                deposits: amounts,
            },
        }
        .data(),
        hall::accounts::InitializeAlloy {
            sponsor,
            alloy: at.alloy,
            share_mint: at.share_mint,
            locked_shares: at.locked,
            share_token_program: token_2022::ID,
            associated_token_program: anchor_spl::associated_token::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    ix.accounts.extend(leg_metas(at.alloy, deposits));
    let signature = world.send(ix, &[])?;
    Ok((at, signature))
}

fn strike(
    world: &World,
    striker: &Keypair,
    at: &Addresses,
    deposits: &[Deposit],
    striker_shares: Pubkey,
    shares: u64,
) -> Result<String, String> {
    let mut ix = Instruction::new_with_bytes(
        hall::ID,
        &hall::instruction::Create {
            shares,
            maximums: vec![u64::MAX; deposits.len()],
        }
        .data(),
        hall::accounts::Create {
            caller: striker.pubkey(),
            alloy: at.alloy,
            share_mint: at.share_mint,
            caller_shares: striker_shares,
            share_token_program: token_2022::ID,
        }
        .to_account_metas(None),
    );
    ix.accounts.extend(leg_metas(at.alloy, deposits));
    world.send(ix, &[striker])
}

fn melt(
    world: &World,
    striker: &Keypair,
    at: &Addresses,
    deposits: &[Deposit],
    striker_shares: Pubkey,
    shares: u64,
) -> Result<String, String> {
    use anchor_lang::solana_program::instruction::AccountMeta;
    let mut ix = Instruction::new_with_bytes(
        hall::ID,
        &hall::instruction::Redeem { shares }.data(),
        hall::accounts::Redeem {
            caller: striker.pubkey(),
            alloy: at.alloy,
            share_mint: at.share_mint,
            caller_shares: striker_shares,
            claim: claim_address(at.alloy, striker.pubkey()),
            share_token_program: token_2022::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    ix.accounts.extend(
        deposits
            .iter()
            .map(|d| AccountMeta::new_readonly(hall_account(at.alloy, d), false)),
    );
    world.send(ix, &[striker])
}

fn withdraw(
    world: &World,
    owner: &Keypair,
    at: &Addresses,
    deposit: &Deposit,
    leg_index: u8,
    destination: Pubkey,
    units: u64,
) -> Result<String, String> {
    let ix = Instruction::new_with_bytes(
        hall::ID,
        &hall::instruction::Withdraw { leg_index, units }.data(),
        hall::accounts::Withdraw {
            owner: owner.pubkey(),
            alloy: at.alloy,
            claim: claim_address(at.alloy, owner.pubkey()),
            mint: deposit.mint,
            hall_account: hall_account(at.alloy, deposit),
            destination,
            token_program: deposit.program,
        }
        .to_account_metas(None),
    );
    world.send(ix, &[owner])
}

fn sync(world: &World, at: &Addresses, deposit: &Deposit, leg_index: u8) -> Result<String, String> {
    let ix = Instruction::new_with_bytes(
        hall::ID,
        &hall::instruction::Sync { leg_index }.data(),
        hall::accounts::SyncLeg {
            alloy: at.alloy,
            hall_account: hall_account(at.alloy, deposit),
        }
        .to_account_metas(None),
    );
    world.send(ix, &[])
}

// --- Reading real state back -------------------------------------------

fn read_alloy(rpc: &Rpc, alloy: Pubkey) -> Alloy {
    let data = rpc
        .account_data(&alloy.to_string())
        .expect("alloy account does not exist");
    *bytemuck::from_bytes(&data[Alloy::DISCRIMINATOR.len()..])
}

fn read_claim(rpc: &Rpc, alloy: Pubkey, owner: Pubkey) -> Option<Claim> {
    let data = rpc.account_data(&claim_address(alloy, owner).to_string())?;
    Some(Claim::try_deserialize(&mut data.as_slice()).expect("claim account did not decode"))
}

fn token_amount(rpc: &Rpc, account: Pubkey) -> u64 {
    let data = rpc.account_data(&account.to_string()).unwrap_or_default();
    if data.len() < 72 {
        return 0;
    }
    u64::from_le_bytes(data[64..72].try_into().unwrap())
}

fn claim_units(rpc: &Rpc, alloy_state: &Alloy, alloy: Pubkey, owner: Pubkey, leg: usize) -> u64 {
    let Some(claim) = read_claim(rpc, alloy, owner) else {
        return 0;
    };
    let leg_state = alloy_state.legs[leg].leg();
    recipe::settle(&claim.entries[leg].claim_leg(), &leg_state)
        .map(|c| c.units)
        .unwrap_or(0)
}

// --- One scenario's fully set up alloy and striker --------------------------

/// One alloy, freshly founded over `stock_a`/`stock_b`, and a fresh striker
/// wallet funded and holding accounts for both. Mirrors
/// `chain/programs/hall/tests/common/stage.rs`'s `Stage`, minus what only
/// litesvm needs.
struct Stage<'a> {
    rpc: &'a Rpc,
    at: Addresses,
    striker: Keypair,
    striker_shares: Pubkey,
    striker_deposits: Vec<Deposit>,
}

/// Founds a fresh alloy at `id` over `stock_a`/`stock_b`. Returns the
/// founding transaction's own result so the founding scenario can show it;
/// every other scenario calls `found` for setup and ignores the signature.
fn found(
    world: &World,
    issuer: &Keypair,
    stock_a: Pubkey,
    stock_b: Pubkey,
    id: u64,
) -> (Result<String, String>, Addresses, Vec<Deposit>) {
    let sponsor = world.payer.pubkey();
    let sponsor_a = open_account(world, sponsor, stock_a).expect("open sponsor A account");
    let sponsor_b = open_account(world, sponsor, stock_b).expect("open sponsor B account");
    mint_to(world, issuer, stock_a, sponsor_a, FIRST_DEPOSIT).expect("fund sponsor A");
    mint_to(world, issuer, stock_b, sponsor_b, SECOND_DEPOSIT).expect("fund sponsor B");
    let deposits = vec![
        Deposit {
            mint: stock_a,
            source: sponsor_a,
            program: token_2022::ID,
        },
        Deposit {
            mint: stock_b,
            source: sponsor_b,
            program: token_2022::ID,
        },
    ];
    let result = initialize_alloy(
        world,
        sponsor,
        id,
        &deposits,
        vec![FIRST_DEPOSIT, SECOND_DEPOSIT],
    );
    match result {
        Ok((at, sig)) => (Ok(sig), at, deposits),
        Err(e) => (Err(e.clone()), addresses(sponsor, id), deposits),
    }
}

fn new_striker(
    world: &World,
    issuer: &Keypair,
    stock_a: Pubkey,
    stock_b: Pubkey,
    share_mint: Pubkey,
) -> (Keypair, Pubkey, Vec<Deposit>) {
    let striker = Keypair::new();
    // redeem's claim account is init_if_needed with payer = caller: unlike
    // every other account this script creates, which the deployer pays for as
    // the transaction's fee payer, the striker's own claim rent is debited
    // from the striker itself. A run without this failed melt with "Transfer:
    // insufficient lamports 0, need 2971800", the exact rent Anchor computed.
    let claim_rent = world
        .rpc
        .minimum_balance_for_rent_exemption(8 + Claim::INIT_SPACE);
    // Solana requires every account to end a transaction at exactly 0 lamports
    // or at least its own rent-exempt minimum: leaving the striker with a
    // small nonzero remainder after it pays claim_rent is not enough on its
    // own, and the whole transaction was rejected post hoc even though the
    // burn inside it had already succeeded. The remainder must clear a bare
    // account's own rent-exempt minimum too, queried rather than guessed.
    let bare_account_rent = world.rpc.minimum_balance_for_rent_exemption(0);
    let ix = system_instruction::transfer(
        &world.payer.pubkey(),
        &striker.pubkey(),
        claim_rent + bare_account_rent + 100_000,
    );
    world.send(ix, &[]).unwrap_or_else(|e| {
        panic!(
            "funding striker {} for its claim rent failed: {e}",
            striker.pubkey()
        )
    });

    let striker_shares =
        open_account(world, striker.pubkey(), share_mint).expect("open striker shares account");
    let striker_a = open_account(world, striker.pubkey(), stock_a).expect("open striker A account");
    let striker_b = open_account(world, striker.pubkey(), stock_b).expect("open striker B account");
    mint_to(world, issuer, stock_a, striker_a, HOLDER_FUNDS).expect("fund striker A");
    mint_to(world, issuer, stock_b, striker_b, HOLDER_FUNDS).expect("fund striker B");
    let deposits = vec![
        Deposit {
            mint: stock_a,
            source: striker_a,
            program: token_2022::ID,
        },
        Deposit {
            mint: stock_b,
            source: striker_b,
            program: token_2022::ID,
        },
    ];
    (striker, striker_shares, deposits)
}

impl<'a> Stage<'a> {
    /// Founds and funds a striker, without striking. Mirrors `Stage::new()`.
    fn new_unstruck(
        world: &'a World<'a>,
        rpc: &'a Rpc,
        issuer: &Keypair,
        stock_a: Pubkey,
        stock_b: Pubkey,
        id: u64,
    ) -> Self {
        let (founding_result, at, _sponsor_deposits) = found(world, issuer, stock_a, stock_b, id);
        founding_result.unwrap_or_else(|e| {
            panic!("initialize_alloy for stage {id} failed, cannot continue: {e}")
        });
        let (striker, striker_shares, striker_deposits) =
            new_striker(world, issuer, stock_a, stock_b, at.share_mint);
        Self {
            rpc,
            at,
            striker,
            striker_shares,
            striker_deposits,
        }
    }

    /// Founds, funds a striker, and strikes 1,000 shares. Mirrors `Stage::struck()`.
    fn struck(
        world: &'a World<'a>,
        rpc: &'a Rpc,
        issuer: &Keypair,
        stock_a: Pubkey,
        stock_b: Pubkey,
        id: u64,
    ) -> Self {
        let stage = Self::new_unstruck(world, rpc, issuer, stock_a, stock_b, id);
        strike(
            world,
            &stage.striker,
            &stage.at,
            &stage.striker_deposits,
            stage.striker_shares,
            1_000,
        )
        .unwrap_or_else(|e| panic!("strike for stage {id} failed, cannot continue: {e}"));
        stage
    }

    fn hall(&self, index: usize) -> Pubkey {
        hall_account(self.at.alloy, &self.striker_deposits[index])
    }

    fn ctx(&self) -> Ctx<'_> {
        Ctx {
            rpc: self.rpc,
            at: Addresses {
                alloy: self.at.alloy,
                share_mint: self.at.share_mint,
                locked: self.at.locked,
            },
            deposits: &self.striker_deposits,
            striker: self.striker.pubkey(),
            striker_shares: self.striker_shares,
        }
    }
}

// --- Transcript, matching tools/explorer/hall.go's decode ------------------

#[derive(Serialize)]
struct Transcript {
    note: String,
    producer: Producer,
    not_shown: Vec<String>,
    scenarios: Vec<Scene>,
}

#[derive(Serialize)]
struct Producer {
    kind: String,
    description: String,
    program_id: String,
    cluster: Option<String>,
    signatures: bool,
}

#[derive(Serialize)]
struct Scene {
    id: String,
    title: String,
    shows: String,
    does_not_show: String,
    steps: Vec<Move>,
}

#[derive(Serialize)]
struct Move {
    actor: String,
    action: String,
    result: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    signature: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    state: Option<HallState>,
}

#[derive(Serialize)]
struct HallState {
    supply: u64,
    legs: Vec<LegState>,
    holder: HolderView,
}

#[derive(Serialize)]
struct LegState {
    stock: String,
    hall_balance: u64,
    ledger: u64,
    pending: u64,
    unclaimed: u64,
}

#[derive(Serialize)]
struct HolderView {
    shares: u64,
    claims: Vec<u64>,
    stock_balances: Vec<u64>,
}

struct Ctx<'a> {
    rpc: &'a Rpc,
    at: Addresses,
    deposits: &'a [Deposit],
    striker: Pubkey,
    striker_shares: Pubkey,
}

fn snapshot(ctx: &Ctx) -> HallState {
    let alloy = read_alloy(ctx.rpc, ctx.at.alloy);
    let stocks = ["A", "B"];
    let legs = (0..ctx.deposits.len())
        .map(|i| {
            let leg = alloy.legs[i];
            LegState {
                stock: stocks[i].to_string(),
                hall_balance: token_amount(ctx.rpc, hall_account(ctx.at.alloy, &ctx.deposits[i])),
                ledger: leg.ledger,
                pending: leg.pending,
                unclaimed: leg.unclaimed,
            }
        })
        .collect();
    let claims = (0..ctx.deposits.len())
        .map(|i| claim_units(ctx.rpc, &alloy, ctx.at.alloy, ctx.striker, i))
        .collect();
    let balances = ctx
        .deposits
        .iter()
        .map(|d| token_amount(ctx.rpc, d.source))
        .collect();
    HallState {
        supply: alloy.supply,
        legs,
        holder: HolderView {
            shares: token_amount(ctx.rpc, ctx.striker_shares),
            claims,
            stock_balances: balances,
        },
    }
}

fn step(ctx: &Ctx, actor: &str, action: &str, result: Result<String, String>) -> Move {
    let (outcome, reason, signature) = match result {
        Ok(sig) => ("ok".to_string(), None, Some(sig)),
        Err(e) => ("refused".to_string(), Some(e), None),
    };
    Move {
        actor: actor.to_string(),
        action: action.to_string(),
        result: outcome,
        reason,
        signature,
        state: Some(snapshot(ctx)),
    }
}

fn scene(id: &str, title: &str, shows: &str, does_not_show: &str, steps: Vec<Move>) -> Scene {
    Scene {
        id: id.to_string(),
        title: title.to_string(),
        shows: shows.to_string(),
        does_not_show: does_not_show.to_string(),
        steps,
    }
}

// --- Scenarios, one alloy each, mirroring demo_transcript.rs ----------------

fn founding_scenario(
    world: &World,
    rpc: &Rpc,
    issuer: &Keypair,
    stock_a: Pubkey,
    stock_b: Pubkey,
    alloy_id: u64,
) -> Scene {
    let (founding_result, at, _sponsor_deposits) = found(world, issuer, stock_a, stock_b, alloy_id);
    let founding_ok = founding_result.is_ok();
    let (striker, striker_shares, striker_deposits) =
        new_striker(world, issuer, stock_a, stock_b, at.share_mint);
    let strike_result = if founding_ok {
        strike(
            world,
            &striker,
            &at,
            &striker_deposits,
            striker_shares,
            1_000,
        )
    } else {
        Err("alloy was not founded".to_string())
    };
    let ctx = Ctx {
        rpc,
        at,
        deposits: &striker_deposits,
        striker: striker.pubkey(),
        striker_shares,
    };
    scene(
        "founding",
        "Founding an alloy and striking shares",
        "Anyone can found an alloy without asking Seametry, on real Token-2022 mints an independent mock issuer controls. A second wallet strikes an exact number of shares.",
        "Whether anyone will hold these shares, or what the shares trade for. The Hall has no price and this run has no market.",
        vec![
            step(&ctx, "sponsor", "initialize_alloy with 5,000,000 of A and 3,000,000 of B, and 1,000,000 genesis shares locked", founding_result),
            step(&ctx, "holder", "strike 1,000 shares", strike_result),
        ],
    )
}

fn dividend_scenario(
    world: &World,
    rpc: &Rpc,
    issuer: &Keypair,
    stock_a: Pubkey,
    stock_b: Pubkey,
    alloy_id: u64,
) -> Scene {
    let stage = Stage::struck(world, rpc, issuer, stock_a, stock_b, alloy_id);
    let ctx = stage.ctx();
    let hall_a = stage.hall(0);

    let minted = mint_to(world, issuer, stock_a, hall_a, 500_000);
    let synced = sync(world, &stage.at, &stage.striker_deposits[0], 0);
    scene(
        "dividend",
        "A dividend paid as new tokens vests instead of arriving at once",
        "Tokens the issuer mints into the Hall are recorded as pending. They reach the ledger in a straight line over one hour, so a payment cannot change what a share is worth in a single block. This run does not wait out the vest: seeing pending rise and the ledger hold is the demonstration.",
        &format!("How any real issuer pays a dividend. Backpack's mechanism is unconfirmed, and xStocks reinvests through a multiplier that changes no balance, which this run does not exercise. The vest window is compiled into the program as {VEST_WINDOW_SECONDS} seconds; nobody waited that long for this run."),
        vec![
            step(&ctx, "issuer", "mint 500,000 of A into the Hall's account, a dividend paid as new tokens", minted),
            step(&ctx, "anyone", "sync leg A", synced),
        ],
    )
}

fn freeze_scenario(
    world: &World,
    rpc: &Rpc,
    issuer: &Keypair,
    stock_a: Pubkey,
    stock_b: Pubkey,
    alloy_id: u64,
) -> Scene {
    let stage = Stage::struck(world, rpc, issuer, stock_a, stock_b, alloy_id);
    let ctx = stage.ctx();
    let hall_a = stage.hall(0);

    let froze = freeze(world, issuer, stock_a, hall_a);
    let blocked_strike = strike(
        world,
        &stage.striker,
        &stage.at,
        &stage.striker_deposits,
        stage.striker_shares,
        10,
    );
    let melt_result = melt(
        world,
        &stage.striker,
        &stage.at,
        &stage.striker_deposits,
        stage.striker_shares,
        400,
    );
    let alloy_now = read_alloy(rpc, stage.at.alloy);
    let owed_a = claim_units(rpc, &alloy_now, stage.at.alloy, stage.striker.pubkey(), 0);
    let owed_b = claim_units(rpc, &alloy_now, stage.at.alloy, stage.striker.pubkey(), 1);
    let withdraw_b = withdraw(
        world,
        &stage.striker,
        &stage.at,
        &stage.striker_deposits[1],
        1,
        stage.striker_deposits[1].source,
        owed_b,
    );
    let withdraw_a_blocked = withdraw(
        world,
        &stage.striker,
        &stage.at,
        &stage.striker_deposits[0],
        0,
        stage.striker_deposits[0].source,
        owed_a,
    );
    let thawed = thaw(world, issuer, stock_a, hall_a);
    let withdraw_a = withdraw(
        world,
        &stage.striker,
        &stage.at,
        &stage.striker_deposits[0],
        0,
        stage.striker_deposits[0].source,
        owed_a,
    );

    scene(
        "freeze",
        "A melt succeeds while the issuer has frozen a constituent",
        "The issuer freezes the Hall's account for A on chain. A new strike is refused. A melt still succeeds, because it moves no constituent. B delivers, the claim on A is refused while frozen, and it delivers once the issuer thaws the account.",
        "That every issuer behaves like this one. This issuer is a mock, controlled by this run, that reproduces the extension set reported for xStocks.",
        vec![
            step(&ctx, "issuer", "freeze the Hall's account for A", froze),
            step(&ctx, "holder", "strike 10 shares", blocked_strike),
            step(&ctx, "holder", "melt 400 shares", melt_result),
            step(&ctx, "holder", "withdraw the whole claim on B", withdraw_b),
            step(&ctx, "holder", "withdraw the whole claim on A", withdraw_a_blocked),
            step(&ctx, "issuer", "thaw the Hall's account for A", thawed),
            step(&ctx, "holder", "withdraw the whole claim on A", withdraw_a),
        ],
    )
}

fn pause_scenario(
    world: &World,
    rpc: &Rpc,
    issuer: &Keypair,
    stock_a: Pubkey,
    stock_b: Pubkey,
    alloy_id: u64,
) -> Scene {
    let stage = Stage::struck(world, rpc, issuer, stock_a, stock_b, alloy_id);
    let ctx = stage.ctx();

    let paused = pause(world, issuer, stock_a);
    let melted = melt(
        world,
        &stage.striker,
        &stage.at,
        &stage.striker_deposits,
        stage.striker_shares,
        400,
    );
    let alloy_now = read_alloy(rpc, stage.at.alloy);
    let owed_a = claim_units(rpc, &alloy_now, stage.at.alloy, stage.striker.pubkey(), 0);
    let withdraw_paused = withdraw(
        world,
        &stage.striker,
        &stage.at,
        &stage.striker_deposits[0],
        0,
        stage.striker_deposits[0].source,
        owed_a,
    );
    let resumed = resume(world, issuer, stock_a);
    let withdraw_resumed = withdraw(
        world,
        &stage.striker,
        &stage.at,
        &stage.striker_deposits[0],
        0,
        stage.striker_deposits[0].source,
        owed_a,
    );

    scene(
        "pause",
        "A paused constituent cannot stop a melt",
        "A pause stops every transfer of A everywhere. The melt still succeeds and the claim on A waits until the issuer resumes.",
        "How long an issuer may keep a constituent paused. The Hall states the delay and cannot end it.",
        vec![
            step(&ctx, "issuer", "pause A everywhere", paused),
            step(&ctx, "holder", "melt 400 shares", melted),
            step(&ctx, "holder", "withdraw the whole claim on A", withdraw_paused),
            step(&ctx, "issuer", "resume A", resumed),
            step(&ctx, "holder", "withdraw the whole claim on A", withdraw_resumed),
        ],
    )
}

fn seizure_scenario(
    world: &World,
    rpc: &Rpc,
    issuer: &Keypair,
    stock_a: Pubkey,
    stock_b: Pubkey,
    alloy_id: u64,
) -> Scene {
    let stage = Stage::struck(world, rpc, issuer, stock_a, stock_b, alloy_id);
    let ctx = stage.ctx();
    let hall_a = stage.hall(0);

    let melted = melt(
        world,
        &stage.striker,
        &stage.at,
        &stage.striker_deposits,
        stage.striker_shares,
        400,
    );
    let issuer_account =
        open_account(world, issuer.pubkey(), stock_a).expect("open issuer A account");
    let held = token_amount(rpc, hall_a);
    let taken = held * 2 / 5;
    let seized = seize(world, issuer, stock_a, hall_a, issuer_account, taken);
    let synced = sync(world, &stage.at, &stage.striker_deposits[0], 0);

    scene(
        "seizure",
        "A seizure is shared between holders and claimants",
        "The issuer takes tokens out of the Hall with its permanent delegate. The next sync applies the loss to the ledger and to unclaimed in proportion.",
        "Whether the issuer would do this, or under what authority. The Hall records that it happened and who bore it.",
        vec![
            step(&ctx, "holder", "melt 400 shares", melted),
            step(&ctx, "issuer", "take two fifths of A out of the Hall with its permanent delegate", seized),
            step(&ctx, "anyone", "sync leg A", synced),
        ],
    )
}

fn donation_scenario(
    world: &World,
    rpc: &Rpc,
    issuer: &Keypair,
    stock_a: Pubkey,
    stock_b: Pubkey,
    alloy_id: u64,
) -> Scene {
    let stage = Stage::struck(world, rpc, issuer, stock_a, stock_b, alloy_id);
    let ctx = stage.ctx();
    let hall_a = stage.hall(0);

    let attacker = Keypair::new();
    let attacker_account =
        open_account(world, attacker.pubkey(), stock_a).expect("open attacker account");
    mint_to(world, issuer, stock_a, attacker_account, 10_000_000).expect("fund attacker");
    let transfer_ix = token::transfer_checked(
        &token_2022::ID,
        &attacker_account,
        &stock_a,
        &hall_a,
        &attacker.pubkey(),
        &[],
        9_000_000,
        STOCK_DECIMALS,
    )
    .unwrap();
    let donated = world.send(transfer_ix, &[&attacker]);
    let synced = sync(world, &stage.at, &stage.striker_deposits[0], 0);

    scene(
        "donation",
        "Sending tokens to the Hall does not move the price of a share",
        "A raw transfer to the Hall is recorded as pending, not added to the ledger, so what a share is worth does not change at once. The sender holds no shares and cannot take the tokens back.",
        "That no attack exists. This shows the one used against vaults that price shares by ratio, and the vesting rule that answers it.",
        vec![
            step(&ctx, "attacker", "send 9,000,000 of A straight to the Hall, holding no shares", donated),
            step(&ctx, "anyone", "sync leg A", synced),
        ],
    )
}

fn refused_founding(
    world: &World,
    issuer: &Keypair,
    id_num: u64,
    id: &str,
    title: &str,
    shows: &str,
    powers: Powers,
    action: &str,
) -> Scene {
    let plain = create_stock(world, issuer, Powers::xstocks()).expect("create plain stock failed");
    let odd = create_stock(world, issuer, powers).expect("create odd stock failed");
    let sponsor_plain =
        open_account(world, world.payer.pubkey(), plain).expect("open sponsor plain account");
    let sponsor_odd =
        open_account(world, world.payer.pubkey(), odd).expect("open sponsor odd account");
    if powers.new_accounts_frozen {
        thaw(world, issuer, odd, sponsor_odd)
            .expect("thaw sponsor account for the frozen-by-default mint");
    }
    mint_to(world, issuer, plain, sponsor_plain, FIRST_DEPOSIT).expect("fund sponsor plain");
    mint_to(world, issuer, odd, sponsor_odd, SECOND_DEPOSIT).expect("fund sponsor odd");
    let deposits = vec![
        Deposit {
            mint: plain,
            source: sponsor_plain,
            program: token_2022::ID,
        },
        Deposit {
            mint: odd,
            source: sponsor_odd,
            program: token_2022::ID,
        },
    ];

    let sponsor = world.payer.pubkey();
    let at = addresses(sponsor, id_num);
    let mut ix = Instruction::new_with_bytes(
        hall::ID,
        &hall::instruction::InitializeAlloy {
            args: InitializeAlloyArgs {
                id: id_num,
                sponsor_mark: [9; 32],
                name: "Refused".to_string(),
                symbol: "REFU".to_string(),
                uri: "https://seametry.example/refused".to_string(),
                genesis_shares: GENESIS_SHARES,
                deposits: vec![FIRST_DEPOSIT, SECOND_DEPOSIT],
            },
        }
        .data(),
        hall::accounts::InitializeAlloy {
            sponsor,
            alloy: at.alloy,
            share_mint: at.share_mint,
            locked_shares: at.locked,
            share_token_program: token_2022::ID,
            associated_token_program: anchor_spl::associated_token::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    ix.accounts.extend(leg_metas(at.alloy, &deposits));
    let result = world.send(ix, &[]);
    let (outcome, reason, signature) = match result {
        Ok(sig) => ("ok".to_string(), None, Some(sig)),
        Err(e) => ("refused".to_string(), Some(e), None),
    };
    scene(
        id,
        title,
        shows,
        "Whether some other treatment of such a constituent would be sound. This is the refusal the program makes, and the reason it gives.",
        vec![Move { actor: "sponsor".to_string(), action: action.to_string(), result: outcome, reason, signature, state: None }],
    )
}

fn main() {
    let rpc = Rpc::new(rpc_url());
    let payer_path = std::env::var("DEPLOYER_KEYPAIR").expect("DEPLOYER_KEYPAIR must be set");
    let payer = read_keypair(&payer_path);
    let world = World {
        rpc: &rpc,
        payer: &payer,
    };

    let before_balance = rpc.balance(&payer.pubkey().to_string());
    println!("deployer balance before: {before_balance} lamports");

    // Alloy ids share a namespace with every earlier run against this same
    // deployer pubkey: devnet accounts persist between process runs, unlike
    // litesvm's fresh state per test. A prior run's founded alloy at id 1
    // caused a real "account already in use" refusal here once. The unix
    // timestamp is a base no earlier run used and no later one run within the
    // same second will reuse, which this tool is not.
    let base_id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("system clock is before 1970")
        .as_secs()
        * 10;

    let issuer = Keypair::new();
    let stock_a = create_stock(&world, &issuer, Powers::xstocks()).expect("create stock A failed");
    let stock_b = create_stock(&world, &issuer, Powers::xstocks()).expect("create stock B failed");

    let mut scenarios = vec![];
    scenarios.push(founding_scenario(
        &world, &rpc, &issuer, stock_a, stock_b, base_id,
    ));
    scenarios.push(dividend_scenario(
        &world,
        &rpc,
        &issuer,
        stock_a,
        stock_b,
        base_id + 1,
    ));
    scenarios.push(freeze_scenario(
        &world,
        &rpc,
        &issuer,
        stock_a,
        stock_b,
        base_id + 2,
    ));
    scenarios.push(pause_scenario(
        &world,
        &rpc,
        &issuer,
        stock_a,
        stock_b,
        base_id + 3,
    ));
    scenarios.push(seizure_scenario(
        &world,
        &rpc,
        &issuer,
        stock_a,
        stock_b,
        base_id + 4,
    ));
    scenarios.push(donation_scenario(
        &world,
        &rpc,
        &issuer,
        stock_a,
        stock_b,
        base_id + 5,
    ));
    scenarios.push(refused_founding(
        &world,
        &issuer,
        base_id + 6,
        "fee",
        "A constituent that takes a transfer fee is refused",
        "A fee on transfer would make the Hall record units it never received, so the alloy is refused at founding, with the reason.",
        Powers { transfer_fee: Some((100, 1_000_000)), ..Powers::xstocks() },
        "initialize_alloy with a constituent that takes a 1 percent transfer fee",
    ));
    scenarios.push(refused_founding(
        &world,
        &issuer,
        base_id + 7,
        "frozen-at-founding",
        "A constituent whose new accounts start frozen is refused",
        "The Hall's account for such a constituent would begin frozen, so the alloy is refused instead of being created unable to move it.",
        Powers { new_accounts_frozen: true, ..Powers::xstocks() },
        "initialize_alloy with a constituent whose new accounts start frozen",
    ));

    let after_balance = rpc.balance(&payer.pubkey().to_string());
    println!("deployer balance after: {after_balance} lamports");
    println!(
        "cost of this run: {} lamports",
        before_balance.saturating_sub(after_balance)
    );

    let transcript = Transcript {
        note: "The Hall demonstration of HALL.md section 7, run on Solana devnet against real Token-2022 mints that carry the extension set reported for xStocks. Every step's signature is a real devnet transaction, checkable at any Solana explorer. Each scenario after founding is its own alloy, over the same two mock stocks, so one scenario's melts and withdrawals never affect another's share balance. Regenerate with: RPC_URL=... DEPLOYER_KEYPAIR=... cargo run --release, from chain/tools/devnet-demo. This file is not compared for drift the way the litesvm transcript is: a devnet run is not reproducible byte for byte, because account addresses and balances differ on every run.".to_string(),
        producer: Producer {
            kind: "devnet".to_string(),
            description: "Solana devnet, a public test cluster. Every signature below can be looked up on any Solana devnet explorer.".to_string(),
            program_id: hall::ID.to_string(),
            cluster: Some("devnet".to_string()),
            signatures: true,
        },
        not_shown: vec![
            "A change of the Scaled UI multiplier. Its initializer takes a floating point number and this repository allows none. The Hall never reads a multiplier.".to_string(),
            "A dividend's vest completing: the vest window is compiled into the program and nobody waited it out for this run.".to_string(),
            "The upgrade authority as a live control: it is not exercised in this run.".to_string(),
        ],
        scenarios,
    };

    let out_path = Path::new(OUTPUT);
    fs::create_dir_all(out_path.parent().unwrap()).expect("cannot create evidence/hall-demo");
    fs::write(
        out_path,
        format!("{}\n", serde_json::to_string_pretty(&transcript).unwrap()),
    )
    .expect("cannot write transcript-devnet.json");
    println!("wrote {}", out_path.display());
}

fn read_keypair(path: &str) -> Keypair {
    let raw =
        fs::read_to_string(path).unwrap_or_else(|e| panic!("cannot read keypair at {path}: {e}"));
    let bytes: Vec<u8> = serde_json::from_str(&raw)
        .unwrap_or_else(|e| panic!("keypair at {path} is not a JSON byte array: {e}"));
    Keypair::try_from(bytes.as_slice())
        .unwrap_or_else(|e| panic!("keypair at {path} did not decode: {e}"))
}
