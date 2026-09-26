//! The Hall against an issuer that uses every power it holds, on real
//! Token-2022 mints. The steps follow HALL.md section 7, except the multiplier
//! change and the upgrade authority, which litesvm cannot show.

mod common;

use {
    anchor_spl::token_2022,
    common::{alloy::*, issuer::*, stage::*, World},
    hall::recipe::VEST_WINDOW_SECONDS,
    solana_keypair::Keypair,
    solana_signer::Signer,
};

/// Step 4. The issuer pays a dividend as newly minted tokens. Sync credits it
/// as pending, and it reaches the ledger only along the vest.
#[test]
fn a_dividend_minted_into_the_hall_vests_instead_of_arriving_at_once() {
    let mut stage = Stage::struck();
    let hall = stage.fixture.hall(0);
    let ledger_before = stage.leg(0).ledger;

    let mint = stage.stocks[0];
    stage
        .issuer
        .mint_to(&mut stage.fixture.world, mint, hall, 500_000)
        .unwrap();
    stage.sync(0);
    assert_eq!(stage.leg(0).pending, 500_000);
    assert_eq!(
        stage.leg(0).ledger,
        ledger_before,
        "a dividend moved the ledger at once"
    );

    stage
        .fixture
        .world
        .set_clock(1_000 + VEST_WINDOW_SECONDS / 2);
    stage.sync(0);
    assert_eq!(stage.leg(0).ledger, ledger_before + 250_000);
    assert_eq!(stage.leg(0).pending, 250_000);
}

/// Step 5. The issuer freezes the Hall's account for one constituent. A melt
/// still succeeds, the other leg delivers, and the frozen leg stays a claim.
#[test]
fn a_frozen_constituent_cannot_stop_a_melt_and_the_frozen_leg_waits_as_a_claim() {
    let mut stage = Stage::struck();
    let (mint, hall) = (stage.stocks[0], stage.fixture.hall(0));
    stage
        .issuer
        .freeze(&mut stage.fixture.world, mint, hall)
        .unwrap();

    let refused_strike = stage.fixture.strike(10, vec![u64::MAX, u64::MAX]);
    assert_refused(&refused_strike, "HallAccountFrozen");

    let melt = stage.fixture.redeem(400);
    assert!(melt.is_ok(), "{}", logs(&melt));

    let frozen_claim = stage.fixture.claim(stage.fixture.striker_key()).entries[0].units;
    let open_claim = stage.fixture.claim(stage.fixture.striker_key()).entries[1].units;
    assert!(frozen_claim > 0 && open_claim > 0);

    assert!(
        stage.fixture.withdraw(1, open_claim).is_ok(),
        "the open leg should deliver"
    );
    assert!(
        stage.fixture.withdraw(0, frozen_claim).is_err(),
        "the frozen leg delivered"
    );
    assert_eq!(
        stage.fixture.claim(stage.fixture.striker_key()).entries[0].units,
        frozen_claim,
        "a refused withdrawal changed the claim"
    );

    // Step 6. The issuer thaws it and the claim withdraws.
    stage
        .issuer
        .thaw(&mut stage.fixture.world, mint, hall)
        .unwrap();
    assert!(stage.fixture.withdraw(0, frozen_claim).is_ok());
}

/// A pause stops every transfer of the constituent everywhere. It cannot stop
/// the melt, and the claim withdraws once the issuer resumes.
#[test]
fn a_paused_constituent_cannot_stop_a_melt() {
    let mut stage = Stage::struck();
    let mint = stage.stocks[0];
    stage.issuer.pause(&mut stage.fixture.world, mint).unwrap();

    let melt = stage.fixture.redeem(400);
    assert!(melt.is_ok(), "{}", logs(&melt));
    let owed = stage.fixture.claim(stage.fixture.striker_key()).entries[0].units;

    assert!(
        stage.fixture.withdraw(0, owed).is_err(),
        "withdrew from a paused mint"
    );

    stage.issuer.resume(&mut stage.fixture.world, mint).unwrap();
    assert!(stage.fixture.withdraw(0, owed).is_ok());
}

/// Step 7. The issuer takes tokens out of the Hall with its permanent delegate.
/// The next sync applies the loss to holders and claimants in proportion.
#[test]
fn a_seizure_by_the_permanent_delegate_is_applied_to_holders_and_claimants_together() {
    let mut stage = Stage::struck();
    stage.fixture.redeem(400).unwrap();
    let before = stage.leg(0);
    let claim_before = stage.fixture.claim(stage.fixture.striker_key()).entries[0].units;

    let (mint, hall) = (stage.stocks[0], stage.fixture.hall(0));
    let issuer_account =
        stage
            .issuer
            .open_account(&mut stage.fixture.world, stage.issuer.authority(), mint);
    let held = stage.fixture.world.token_amount(hall);
    let taken = held * 2 / 5;
    stage
        .issuer
        .seize(&mut stage.fixture.world, mint, hall, issuer_account, taken)
        .unwrap();
    stage.sync(0);

    let after = stage.leg(0);
    assert!(
        after.ledger < before.ledger,
        "holders bore none of the loss"
    );
    assert!(
        after.unclaimed < before.unclaimed,
        "claimants bore none of the loss"
    );
    assert_eq!(
        stage.fixture.world.token_amount(hall),
        after.ledger + after.pending + after.unclaimed,
        "the balance invariant broke"
    );
    let claim_after = stage.fixture.claim(stage.fixture.striker_key()).entries[0];
    let settled = hall::recipe::settle(&claim_after.claim_leg(), &after.leg())
        .unwrap()
        .units;
    assert!(
        settled < claim_before,
        "the claim did not shrink with the seizure"
    );
}

/// Step 8. An attacker sends tokens straight to the Hall to move the price of a
/// share. What a share is worth does not move at once, and the attacker ends
/// with less than they started with.
#[test]
fn an_attackers_donation_does_not_move_the_price_and_costs_the_attacker() {
    let mut stage = Stage::struck();
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

    let alloy = stage.fixture.world.alloy(stage.fixture.at.alloy);
    let (ledger_before, supply) = (alloy.legs[0].ledger, alloy.supply);

    let donation = 9_000_000;
    let transfer = anchor_spl::token_interface::spl_token_2022::instruction::transfer_checked(
        &token_2022::ID,
        &account,
        &mint,
        &hall,
        &attacker.pubkey(),
        &[],
        donation,
        STOCK_DECIMALS,
    )
    .unwrap();
    stage
        .fixture
        .world
        .send_instructions(&[transfer], &[&attacker])
        .unwrap();
    stage.sync(0);

    let leg = stage.leg(0);
    assert_eq!(
        leg.ledger, ledger_before,
        "a donation raised what a share is worth at once"
    );
    assert_eq!(leg.pending, donation);
    assert_eq!(
        stage.fixture.world.alloy(stage.fixture.at.alloy).supply,
        supply
    );

    // The attacker holds no shares, so nothing of the donation comes back to them.
    assert_eq!(
        stage.fixture.world.token_amount(account),
        10_000_000 - donation
    );
}

/// An issuer that skims a fee on transfer would make the Hall record units it
/// never received, so the alloy is refused.
#[test]
fn a_constituent_that_takes_a_transfer_fee_is_refused() {
    let mut world = World::new();
    let issuer = Issuer::new(&mut world);
    let plain = issuer.create_stock(&mut world, Powers::xstocks());
    let skimming = issuer.create_stock(
        &mut world,
        Powers {
            transfer_fee: Some((100, 1_000_000)),
            ..Powers::xstocks()
        },
    );
    let sponsor = world.sponsor();
    let deposits: Vec<Deposit> = [(plain, FIRST), (skimming, SECOND)]
        .into_iter()
        .map(|(mint, amount)| {
            let source = issuer.open_account(&mut world, sponsor, mint);
            issuer.mint_to(&mut world, mint, source, amount).unwrap();
            Deposit {
                mint,
                source,
                program: token_2022::ID,
                amount,
            }
        })
        .collect();

    assert_refused(
        &initialize(&mut world, &deposits, amounts(&deposits)),
        "DepositNotReceivedInFull",
    );
}

/// A mint whose new accounts start frozen would hand the Hall a frozen account,
/// so the alloy is refused instead of created unable to move that constituent.
#[test]
fn a_constituent_whose_new_accounts_start_frozen_is_refused() {
    let mut world = World::new();
    let issuer = Issuer::new(&mut world);
    let mint = issuer.create_stock(
        &mut world,
        Powers {
            new_accounts_frozen: true,
            ..Powers::xstocks()
        },
    );
    let sponsor = world.sponsor();
    let source = issuer.open_account(&mut world, sponsor, mint);
    issuer.thaw(&mut world, mint, source).unwrap();
    issuer.mint_to(&mut world, mint, source, FIRST).unwrap();
    let deposits = [Deposit {
        mint,
        source,
        program: token_2022::ID,
        amount: FIRST,
    }];

    assert_refused(
        &initialize(&mut world, &deposits, amounts(&deposits)),
        "HallAccountFrozen",
    );
}
