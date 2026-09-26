//! Runs the Hall demonstration of HALL.md section 7 against real Token-2022
//! mints and records it as `evidence/hall-demo/transcript.json`, which the
//! Explorer renders.
//!
//! The producer is a local simulator (litesvm), and the file says so. A later
//! run against devnet writes the same shape with `producer.kind` set to
//! `devnet` and a signature on every step, so the page cannot describe one as
//! the other.
//!
//! By default the test compares what it produces with the committed file, the
//! way the vectors are checked. Set WRITE_TRANSCRIPT=1 to rewrite it.

mod common;

use {
    anchor_spl::token_2022,
    anchor_spl::token_interface::spl_token_2022::{error::TokenError, instruction as token},
    common::{alloy::*, issuer::*, stage::*, World},
    hall::recipe::{self, VEST_WINDOW_SECONDS},
    serde_json::{json, Value},
    solana_keypair::Keypair,
    solana_signer::Signer,
};

const PATH: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../evidence/hall-demo/transcript.json"
);

const STOCKS: [&str; 2] = ["A", "B"];

/// The program's own reason for a refusal: its error code when it raised one,
/// otherwise the token program's message, otherwise the runtime's.
fn reason(outcome: &Outcome) -> Option<String> {
    let Err(failure) = outcome else {
        return None;
    };
    let logs = &failure.meta.logs;
    for line in logs {
        if let Some(rest) = line.split("Error Code: ").nth(1) {
            return Some(rest.split('.').next().unwrap_or(rest).to_string());
        }
    }
    for line in logs {
        if let Some(rest) = line.strip_prefix("Program log: Error: ") {
            return Some(rest.to_string());
        }
    }
    let runtime = failure.err.to_string();
    if let Some(code) = runtime.split("custom program error: 0x").nth(1) {
        if u32::from_str_radix(code.trim(), 16) == Ok(TokenError::MintPaused as u32) {
            return Some("MintPaused (raised by Token-2022)".to_string());
        }
    }
    Some(runtime)
}

fn claim_units(stage: &Stage, leg: usize) -> u64 {
    let owner = stage.fixture.striker_key();
    let Some(account) = stage
        .fixture
        .world
        .svm
        .get_account(&stage.fixture.claim_address(owner))
    else {
        return 0;
    };
    let claim = <hall::state::Claim as anchor_lang::AccountDeserialize>::try_deserialize(
        &mut account.data.as_slice(),
    )
    .unwrap();
    let alloy_leg = stage.leg(leg).leg();
    recipe::settle(&claim.entries[leg].claim_leg(), &alloy_leg)
        .unwrap()
        .units
}

/// Everything a reader needs to see a step's effect, and nothing that varies
/// from run to run.
fn snapshot(stage: &Stage) -> Value {
    let world = &stage.fixture.world;
    let alloy = world.alloy(stage.fixture.at.alloy);
    let legs: Vec<Value> = (0..2)
        .map(|i| {
            let leg = alloy.legs[i];
            json!({
                "stock": STOCKS[i],
                "hall_balance": world.token_amount(stage.fixture.hall(i)),
                "ledger": leg.ledger,
                "pending": leg.pending,
                "unclaimed": leg.unclaimed,
            })
        })
        .collect();
    let holder = json!({
        "shares": world.token_amount(stage.fixture.striker_shares),
        "claims": [claim_units(stage, 0), claim_units(stage, 1)],
        "stock_balances": [
            world.token_amount(stage.fixture.sources[0].source),
            world.token_amount(stage.fixture.sources[1].source),
        ],
    });
    json!({ "supply": alloy.supply, "legs": legs, "holder": holder })
}

/// One step: who did what, what happened, and the state afterwards.
fn step(stage: &Stage, actor: &str, action: &str, outcome: &Outcome) -> Value {
    let mut value = json!({
        "actor": actor,
        "action": action,
        "result": if outcome.is_ok() { "ok" } else { "refused" },
        "state": snapshot(stage),
    });
    if let Some(reason) = reason(outcome) {
        value["reason"] = json!(reason);
    }
    value
}

fn scenario(id: &str, title: &str, shows: &str, does_not_show: &str, steps: Vec<Value>) -> Value {
    json!({
        "id": id,
        "title": title,
        "shows": shows,
        "does_not_show": does_not_show,
        "steps": steps,
    })
}

fn founding() -> Value {
    let mut stage = Stage::new();
    let mut steps = vec![step(
        &stage,
        "sponsor",
        "initialize_alloy with 5,000,000 of A and 3,000,000 of B, and 1,000,000 genesis shares locked",
        &Ok(litesvm::types::TransactionMetadata::default()),
    )];
    let outcome = stage.fixture.strike(1_000, vec![u64::MAX, u64::MAX]);
    steps.push(step(&stage, "holder", "strike 1,000 shares", &outcome));
    scenario(
        "founding",
        "Founding an alloy and striking shares",
        "Anyone can found an alloy without asking Seametry. The genesis shares are held by an account the program cannot move from, and a second wallet strikes an exact number of shares, paying the amounts the Hall computes and rounds up.",
        "Whether anyone will hold these shares, or what the shares trade for. The Hall has no price and this run has no market.",
        steps,
    )
}

fn dividend() -> Value {
    let mut stage = Stage::struck();
    let mut steps = vec![];
    let (mint, hall) = (stage.stocks[0], stage.fixture.hall(0));
    let minted = stage
        .issuer
        .mint_to(&mut stage.fixture.world, mint, hall, 500_000);
    steps.push(step(
        &stage,
        "issuer",
        "mint 500,000 of A into the Hall's account, a dividend paid as new tokens",
        &minted,
    ));
    let synced = stage.try_sync(0);
    steps.push(step(&stage, "anyone", "sync leg A", &synced));
    stage
        .fixture
        .world
        .set_clock(1_000 + VEST_WINDOW_SECONDS / 2);
    let later = stage.try_sync(0);
    steps.push(step(
        &stage,
        "anyone",
        "sync leg A, half an hour later",
        &later,
    ));
    // The ledger per share is no longer a whole number, so this strike and melt
    // round, and the recording shows which way.
    let strike = stage.fixture.strike(7, vec![u64::MAX, u64::MAX]);
    steps.push(step(&stage, "holder", "strike 7 shares", &strike));
    let melt = stage.fixture.redeem(7);
    steps.push(step(&stage, "holder", "melt 7 shares", &melt));
    scenario(
        "dividend",
        "A dividend paid as new tokens vests instead of arriving at once",
        "Tokens the issuer mints into the Hall are recorded as pending. They reach the ledger in a straight line over one hour, so a payment cannot change what a share is worth in a single block. Once the ledger per share is not a whole number, a strike takes the rounded up amount and a melt returns the rounded down amount, and the difference stays with the Hall.",
        "How any real issuer pays a dividend. Backpack's mechanism is unconfirmed, and xStocks reinvests through a multiplier that changes no balance, which this run does not exercise.",
        steps,
    )
}

fn freeze() -> Value {
    let mut stage = Stage::struck();
    let mut steps = vec![];
    let (mint, hall) = (stage.stocks[0], stage.fixture.hall(0));
    let frozen = stage.issuer.freeze(&mut stage.fixture.world, mint, hall);
    steps.push(step(
        &stage,
        "issuer",
        "freeze the Hall's account for A",
        &frozen,
    ));
    let strike = stage.fixture.strike(10, vec![u64::MAX, u64::MAX]);
    steps.push(step(&stage, "holder", "strike 10 shares", &strike));
    let melt = stage.fixture.redeem(400);
    steps.push(step(&stage, "holder", "melt 400 shares", &melt));
    let (owed_a, owed_b) = (claim_units(&stage, 0), claim_units(&stage, 1));
    let leg_b = stage.fixture.withdraw(1, owed_b);
    steps.push(step(
        &stage,
        "holder",
        "withdraw the whole claim on B",
        &leg_b,
    ));
    let leg_a = stage.fixture.withdraw(0, owed_a);
    steps.push(step(
        &stage,
        "holder",
        "withdraw the whole claim on A",
        &leg_a,
    ));
    let thawed = stage.issuer.thaw(&mut stage.fixture.world, mint, hall);
    steps.push(step(
        &stage,
        "issuer",
        "thaw the Hall's account for A",
        &thawed,
    ));
    let leg_a_again = stage.fixture.withdraw(0, owed_a);
    steps.push(step(
        &stage,
        "holder",
        "withdraw the whole claim on A",
        &leg_a_again,
    ));
    scenario(
        "freeze",
        "A melt succeeds while the issuer has frozen a constituent",
        "The issuer freezes the Hall's account for A. A new strike is refused, because the Hall cannot take A in. A melt still succeeds, because it moves no constituent. B is delivered, the claim on A is refused while frozen and stays exactly as it was, and it is delivered once the issuer thaws the account.",
        "That every issuer behaves like this one. This issuer is a mock that reproduces the extension set reported for xStocks, run in a simulator.",
        steps,
    )
}

fn pause() -> Value {
    let mut stage = Stage::struck();
    let mut steps = vec![];
    let mint = stage.stocks[0];
    let paused = stage.issuer.pause(&mut stage.fixture.world, mint);
    steps.push(step(&stage, "issuer", "pause A everywhere", &paused));
    let melt = stage.fixture.redeem(400);
    steps.push(step(&stage, "holder", "melt 400 shares", &melt));
    let owed = claim_units(&stage, 0);
    let refused = stage.fixture.withdraw(0, owed);
    steps.push(step(
        &stage,
        "holder",
        "withdraw the whole claim on A",
        &refused,
    ));
    let resumed = stage.issuer.resume(&mut stage.fixture.world, mint);
    steps.push(step(&stage, "issuer", "resume A", &resumed));
    let delivered = stage.fixture.withdraw(0, owed);
    steps.push(step(
        &stage,
        "holder",
        "withdraw the whole claim on A",
        &delivered,
    ));
    scenario(
        "pause",
        "A paused constituent cannot stop a melt",
        "A pause stops every transfer of A. The melt still succeeds and the claim on A waits until the issuer resumes.",
        "How long an issuer may keep a constituent paused. The Hall states the delay and cannot end it.",
        steps,
    )
}

fn seizure() -> Value {
    let mut stage = Stage::struck();
    let mut steps = vec![];
    let melt = stage.fixture.redeem(400);
    steps.push(step(&stage, "holder", "melt 400 shares", &melt));
    let (mint, hall) = (stage.stocks[0], stage.fixture.hall(0));
    let issuer_account =
        stage
            .issuer
            .open_account(&mut stage.fixture.world, stage.issuer.authority(), mint);
    let taken = stage.fixture.world.token_amount(hall) * 2 / 5;
    let seized = stage
        .issuer
        .seize(&mut stage.fixture.world, mint, hall, issuer_account, taken);
    steps.push(step(
        &stage,
        "issuer",
        "take two fifths of A out of the Hall with its permanent delegate",
        &seized,
    ));
    let synced = stage.try_sync(0);
    steps.push(step(&stage, "anyone", "sync leg A", &synced));
    scenario(
        "seizure",
        "A seizure is shared between holders and claimants",
        "The issuer takes tokens out of the Hall. The next sync notices the balance fell and applies the loss to the ledger and to unclaimed in proportion. A melt that has not yet been withdrawn shrinks with it.",
        "Whether the issuer would do this, or under what authority. The Hall records that it happened and who bore it.",
        steps,
    )
}

fn donation() -> Value {
    let mut stage = Stage::struck();
    let mut steps = vec![];
    let (mint, hall) = (stage.stocks[0], stage.fixture.hall(0));
    let attacker = Keypair::new();
    stage
        .fixture
        .world
        .svm
        .airdrop(&attacker.pubkey(), 1_000_000_000)
        .unwrap();
    let account = stage
        .issuer
        .open_account(&mut stage.fixture.world, attacker.pubkey(), mint);
    stage
        .issuer
        .mint_to(&mut stage.fixture.world, mint, account, 10_000_000)
        .unwrap();
    let transfer = token::transfer_checked(
        &token_2022::ID,
        &account,
        &mint,
        &hall,
        &attacker.pubkey(),
        &[],
        9_000_000,
        STOCK_DECIMALS,
    )
    .unwrap();
    let sent = stage
        .fixture
        .world
        .send_instructions(&[transfer], &[&attacker]);
    steps.push(step(
        &stage,
        "attacker",
        "send 9,000,000 of A straight to the Hall, holding no shares",
        &sent,
    ));
    let synced = stage.try_sync(0);
    steps.push(step(&stage, "anyone", "sync leg A", &synced));
    scenario(
        "donation",
        "Sending tokens to the Hall does not move the price of a share",
        "A raw transfer to the Hall is recorded as pending, not added to the ledger, so what a share is worth does not change at once. The sender holds no shares and cannot take the tokens back.",
        "That no attack exists. This shows the one used against vaults that price shares by ratio, and the vesting rule that answers it.",
        steps,
    )
}

/// The founding is refused, so there is no state to show, only the reason.
fn refused_founding(id: &str, title: &str, shows: &str, powers: Powers, action: &str) -> Value {
    let mut world = World::new();
    let issuer = Issuer::new(&mut world);
    let plain = issuer.create_stock(&mut world, Powers::xstocks());
    let odd = issuer.create_stock(&mut world, powers);
    let sponsor = world.sponsor();
    let deposits: Vec<Deposit> = [(plain, 5_000_000), (odd, 3_000_000)]
        .into_iter()
        .map(|(mint, amount)| {
            let source = issuer.open_account(&mut world, sponsor, mint);
            if powers.new_accounts_frozen && mint == odd {
                issuer.thaw(&mut world, mint, source).unwrap();
            }
            issuer.mint_to(&mut world, mint, source, amount).unwrap();
            Deposit {
                mint,
                source,
                program: token_2022::ID,
                amount,
            }
        })
        .collect();
    let outcome = initialize(&mut world, &deposits, amounts(&deposits));
    let mut refused = json!({
        "actor": "sponsor",
        "action": action,
        "result": if outcome.is_ok() { "ok" } else { "refused" },
    });
    if let Some(reason) = reason(&outcome) {
        refused["reason"] = json!(reason);
    }
    scenario(
        id,
        title,
        shows,
        "Whether some other treatment of such a constituent would be sound. This is the refusal the program makes, and the reason it gives.",
        vec![refused],
    )
}

fn transcript() -> Value {
    json!({
        "note": "The Hall demonstration of HALL.md section 7, run against real Token-2022 mints that carry the extension set reported for xStocks. Regenerate with WRITE_TRANSCRIPT=1 cargo test --test demo_transcript. The test fails if this file differs from what the run produces.",
        "producer": {
            "kind": "litesvm",
            "description": "A local simulator running the compiled program and the real Token-2022 program. Nothing here was sent to a cluster.",
            "program_id": hall::ID.to_string(),
            "cluster": Value::Null,
            "signatures": false,
        },
        "not_shown": [
            "A change of the Scaled UI multiplier. Its initializer takes a floating point number and this repository allows none. The Hall never reads a multiplier.",
            "The upgrade authority. A simulator has none to show.",
            "A run on devnet or mainnet.",
        ],
        "scenarios": [
            founding(),
            dividend(),
            freeze(),
            pause(),
            seizure(),
            donation(),
            refused_founding(
                "fee",
                "A constituent that takes a transfer fee is refused",
                "A fee on transfer would make the Hall record units it never received, so the alloy is refused at founding, with the reason.",
                Powers { transfer_fee: Some((100, 1_000_000)), ..Powers::xstocks() },
                "initialize_alloy with a constituent that takes a 1 percent transfer fee",
            ),
            refused_founding(
                "frozen-at-founding",
                "A constituent whose new accounts start frozen is refused",
                "The Hall's account for such a constituent would begin frozen, so the alloy is refused instead of being created unable to move it.",
                Powers { new_accounts_frozen: true, ..Powers::xstocks() },
                "initialize_alloy with a constituent whose new accounts start frozen",
            ),
        ],
    })
}

#[test]
fn the_demonstration_transcript_matches_the_committed_file() {
    let produced = format!("{}\n", serde_json::to_string_pretty(&transcript()).unwrap());

    if std::env::var("WRITE_TRANSCRIPT").is_ok() {
        std::fs::create_dir_all(std::path::Path::new(PATH).parent().unwrap()).unwrap();
        std::fs::write(PATH, &produced).unwrap();
        return;
    }

    let committed = std::fs::read_to_string(PATH).unwrap_or_else(|e| {
        panic!("cannot read {PATH}: {e}. Generate it with: WRITE_TRANSCRIPT=1 cargo test --test demo_transcript")
    });
    assert!(
        produced == committed,
        "the transcript drifted from evidence/hall-demo/transcript.json. Regenerate deliberately with WRITE_TRANSCRIPT=1 and review the diff."
    );
}
