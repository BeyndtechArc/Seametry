//! The properties of HALL.md section 5, checked over seeded random sequences.
//!
//! Three wallets strike, melt and withdraw against one alloy while the test
//! plays the issuer: it donates to the Hall, takes tokens from it, and freezes
//! and thaws its accounts. After every step the properties below must hold. A
//! failure names the seed and the step, and the same seed reproduces it.

mod common;

use {
    anchor_lang::AccountDeserialize,
    anchor_spl::token::spl_token::{self, state::AccountState},
    common::{alloy::*, fixture::*},
    hall::recipe,
    solana_signer::Signer,
};

const SEQUENCES: u64 = 25;
const STEPS: usize = 60;

/// xorshift64*, so the test needs no dependency and a seed is a plain number.
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 >> 12;
        self.0 ^= self.0 << 25;
        self.0 ^= self.0 >> 27;
        self.0.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }

    fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }

    fn between(&mut self, low: u64, high: u64) -> u64 {
        low + self.below(high - low + 1)
    }
}

struct Run {
    fixture: Fixture,
    wallets: Vec<Wallet>,
    frozen: [bool; 2],
    now: i64,
    /// Net tokens the issuer has added to (positive) or taken from (negative)
    /// each Hall account outside the program.
    external: [i128; 2],
    baseline: [u128; 2],
    seed: u64,
}

impl Run {
    fn new(seed: u64) -> Self {
        let mut fixture = Fixture::new();
        let wallets = (0..3).map(|_| fixture.new_wallet()).collect();
        let mut run = Self {
            fixture,
            wallets,
            frozen: [false; 2],
            now: 1_000,
            external: [0; 2],
            baseline: [0; 2],
            seed,
        };
        run.baseline = [run.total(0), run.total(1)];
        run.fixture.world.set_clock(run.now);
        run
    }

    /// Every token of one constituent that the wallets and the Hall hold.
    fn total(&self, leg: usize) -> u128 {
        let wallets: u128 = self
            .wallets
            .iter()
            .map(|w| u128::from(self.fixture.world.token_amount(w.sources[leg].source)))
            .sum();
        wallets + u128::from(self.fixture.world.token_amount(self.fixture.hall(leg)))
    }

    fn context(&self, step: usize, what: &str) -> String {
        format!("seed {}, step {step}, {what}", self.seed)
    }

    fn sync(&mut self, leg: usize) {
        let outcome = self.fixture.world.send(
            hall::instruction::Sync {
                leg_index: leg as u8,
            },
            hall::accounts::SyncLeg {
                alloy: self.fixture.at.alloy,
                hall_account: self.fixture.hall(leg),
            },
        );
        assert!(
            outcome.is_ok(),
            "seed {}: sync failed: {}",
            self.seed,
            logs(&outcome)
        );
    }

    /// Properties that must hold after every step.
    fn check(&self, step: usize, what: &str, synced: &[usize]) {
        self.trace(step, what);
        let context = self.context(step, what);
        let alloy = self.fixture.world.alloy(self.fixture.at.alloy);

        // The balance invariant holds for every leg the last instruction synced.
        for &leg in synced {
            self.fixture.assert_leg_matches_ledger(leg, &context);
        }

        for leg_index in 0..2 {
            let leg = alloy.legs[leg_index].leg();

            // Claims never sum to more than the Hall holds for them.
            let mut claimed: u128 = 0;
            for wallet in &self.wallets {
                if let Some(account) = self
                    .fixture
                    .world
                    .svm
                    .get_account(&self.fixture.claim_address(wallet.key.pubkey()))
                {
                    let claim =
                        hall::state::Claim::try_deserialize(&mut account.data.as_slice()).unwrap();
                    let settled = recipe::settle(&claim.entries[leg_index].claim_leg(), &leg)
                        .unwrap_or_else(|e| panic!("{context}: settling: {e:?}"));
                    claimed += u128::from(settled.units);
                }
            }
            assert!(
                claimed <= u128::from(leg.unclaimed),
                "{context}: leg {leg_index}: claims are worth {claimed} but the Hall holds {} for them",
                leg.unclaimed
            );

            // Nothing moved a token except the issuer, which the test tracks.
            let expected =
                i128::try_from(self.baseline[leg_index]).unwrap() + self.external[leg_index];
            assert_eq!(
                i128::try_from(self.total(leg_index)).unwrap(),
                expected,
                "{context}: leg {leg_index}: tokens appeared or vanished outside the issuer's actions"
            );
        }
    }

    /// Set HALL_TRACE=1 and run with --nocapture to see every step and the
    /// state each leg and claim is left in.
    fn trace(&self, step: usize, what: &str) {
        if std::env::var("HALL_TRACE").is_err() {
            return;
        }
        let alloy = self.fixture.world.alloy(self.fixture.at.alloy);
        eprintln!("seed {} step {step}: {what}", self.seed);
        for leg_index in 0..2 {
            let record = alloy.legs[leg_index];
            let leg = record.leg();
            eprintln!(
                "  leg {leg_index}: hall={} ledger={} pending={} unclaimed={} index={} epoch={} frozen={}",
                self.fixture.world.token_amount(self.fixture.hall(leg_index)),
                leg.ledger,
                leg.pending,
                leg.unclaimed,
                leg.index(),
                leg.claim_epoch,
                self.frozen[leg_index]
            );
            for (w, wallet) in self.wallets.iter().enumerate() {
                let address = self.fixture.claim_address(wallet.key.pubkey());
                if let Some(account) = self.fixture.world.svm.get_account(&address) {
                    let claim =
                        hall::state::Claim::try_deserialize(&mut account.data.as_slice()).unwrap();
                    let entry = claim.entries[leg_index];
                    let settled = recipe::settle(&entry.claim_leg(), &leg).map(|c| c.units);
                    eprintln!(
                        "    wallet {w}: stored units={} index={} epoch={} settled now={settled:?}",
                        entry.units, entry.index, entry.epoch
                    );
                }
            }
        }
    }

    fn step(&mut self, rng: &mut Rng, step: usize) {
        let wallet = rng.below(3) as usize;
        match rng.below(8) {
            0 | 1 => self.strike(rng, wallet, step),
            2 | 3 => self.melt(rng, wallet, step),
            4 => self.withdraw(rng, wallet, step),
            5 => self.donate(rng, step),
            6 => self.seize(rng, step),
            _ => self.toggle_freeze(rng, step),
        }
    }

    fn strike(&mut self, rng: &mut Rng, wallet: usize, step: usize) {
        let shares = rng.between(1, 50_000);
        let before = self.snapshot();

        // A cap of zero must refuse the strike and move nothing.
        if rng.below(4) == 0 {
            let w = &self.wallets[wallet];
            let outcome = self.fixture.strike_capped_as(&w, shares, vec![0, 0]);
            assert_refused(&outcome, "ExceedsMaximum");
            assert_eq!(
                self.snapshot(),
                before,
                "{}",
                self.context(step, "a capped strike moved tokens")
            );
            self.check(step, "capped strike", &[]);
            return;
        }

        let outcome = self.fixture.strike_as(&self.wallets[wallet], shares);
        if self.frozen.iter().any(|&f| f) {
            assert!(
                outcome.is_err(),
                "{}",
                self.context(step, "a strike succeeded into a frozen account")
            );
            assert_eq!(
                self.snapshot(),
                before,
                "{}",
                self.context(step, "a refused strike moved tokens")
            );
        } else {
            assert!(
                outcome.is_ok(),
                "{}: {}",
                self.context(step, "strike"),
                logs(&outcome)
            );
        }
        let synced: &[usize] = if outcome.is_err() { &[] } else { &[0, 1] };
        self.check(step, "strike", synced);
    }

    fn melt(&mut self, rng: &mut Rng, wallet: usize, step: usize) {
        let held = self.fixture.world.token_amount(self.wallets[wallet].shares);
        if held == 0 {
            return;
        }
        let shares = rng.between(1, held);
        let outcome = self.fixture.redeem_as(&self.wallets[wallet], shares);

        // A melt is never blocked, whatever the issuer has frozen.
        assert!(
            outcome.is_ok(),
            "{}: {}",
            self.context(step, "melt"),
            logs(&outcome)
        );
        assert!(
            !logs(&outcome).contains(&format!("Program {} invoke", spl_token::ID)),
            "{}",
            self.context(step, "a melt invoked a constituent's token program")
        );
        self.check(step, "melt", &[0, 1]);
    }

    fn withdraw(&mut self, rng: &mut Rng, wallet: usize, step: usize) {
        let leg = rng.below(2) as usize;
        let owner = self.wallets[wallet].key.pubkey();
        let Some(account) = self
            .fixture
            .world
            .svm
            .get_account(&self.fixture.claim_address(owner))
        else {
            return;
        };
        let claim = hall::state::Claim::try_deserialize(&mut account.data.as_slice()).unwrap();
        // What the claim is worth once withdraw has synced the leg, which is
        // what a seizure the leg has not yet seen will do to it.
        let stored = self.fixture.world.alloy(self.fixture.at.alloy).legs[leg].leg();
        let balance = self.fixture.world.token_amount(self.fixture.hall(leg));
        let synced = recipe::sync(&stored, balance, self.now).unwrap().after;
        let owed = recipe::settle(&claim.entries[leg].claim_leg(), &synced)
            .unwrap()
            .units;
        if owed == 0 {
            return;
        }
        let units = rng.between(1, owed);
        let before = self.snapshot();

        let outcome = self
            .fixture
            .withdraw_as(&self.wallets[wallet], leg as u8, units);
        if self.frozen[leg] {
            assert!(
                outcome.is_err(),
                "{}",
                self.context(step, "withdrew through a frozen account")
            );
            assert_eq!(
                self.snapshot(),
                before,
                "{}",
                self.context(step, "a refused withdrawal moved tokens")
            );
        } else {
            assert!(
                outcome.is_ok(),
                "{}: {}",
                self.context(step, "withdraw"),
                logs(&outcome)
            );
        }
        let synced: &[usize] = if self.frozen[leg] { &[] } else { &[leg] };
        self.check(step, "withdraw", synced);
    }

    /// The issuer sends tokens to the Hall. Half the time the leg is synced at
    /// once, and then a donation must not have moved the ledger: with no time
    /// passing, the credit is pending and vests later. The other half it is left
    /// for the next instruction to sync, which is what `create` and `redeem` must
    /// each do before they price anything.
    fn donate(&mut self, rng: &mut Rng, step: usize) {
        let leg = rng.below(2) as usize;
        self.sync(leg);
        let ledger_before = self.fixture.world.alloy(self.fixture.at.alloy).legs[leg].ledger;

        let gift = rng.between(1, 3_000_000);
        let hall = self.fixture.hall(leg);
        let held = self.fixture.world.token_amount(hall);
        self.fixture.world.set_token_amount(hall, held + gift);
        self.external[leg] += i128::from(gift);

        if rng.below(2) == 0 {
            self.check(step, "donation left unsynced", &[]);
        } else {
            self.sync(leg);
            let ledger_after = self.fixture.world.alloy(self.fixture.at.alloy).legs[leg].ledger;
            assert_eq!(
                ledger_after,
                ledger_before,
                "{}",
                self.context(
                    step,
                    "a donation moved the ledger at once instead of vesting"
                )
            );
            self.check(step, "donation", &[leg]);
        }
        self.advance(rng);
    }

    fn seize(&mut self, rng: &mut Rng, step: usize) {
        let leg = rng.below(2) as usize;
        let hall = self.fixture.hall(leg);
        let held = self.fixture.world.token_amount(hall);
        if held == 0 {
            return;
        }
        let taken = rng.between(1, held);
        self.fixture.world.set_token_amount(hall, held - taken);
        self.external[leg] -= i128::from(taken);

        if rng.below(2) == 0 {
            self.check(step, "seizure left unsynced", &[]);
        } else {
            self.sync(leg);
            self.check(step, "seizure", &[leg]);
        }
    }

    fn toggle_freeze(&mut self, rng: &mut Rng, step: usize) {
        let leg = rng.below(2) as usize;
        self.frozen[leg] = !self.frozen[leg];
        let state = if self.frozen[leg] {
            AccountState::Frozen
        } else {
            AccountState::Initialized
        };
        self.fixture
            .world
            .set_token_state(self.fixture.hall(leg), state);
        self.check(step, "freeze toggled", &[]);
    }

    fn advance(&mut self, rng: &mut Rng) {
        self.now += rng.between(1, 2_400) as i64;
        self.fixture.world.set_clock(self.now);
    }

    /// Every balance a refused instruction must leave alone.
    fn snapshot(&self) -> Vec<u64> {
        let mut all = vec![];
        for wallet in &self.wallets {
            all.push(self.fixture.world.token_amount(wallet.shares));
            for source in &wallet.sources {
                all.push(self.fixture.world.token_amount(source.source));
            }
        }
        for leg in 0..2 {
            all.push(self.fixture.world.token_amount(self.fixture.hall(leg)));
        }
        all
    }
}

#[test]
fn the_properties_hold_over_random_sequences() {
    for seed in 1..=SEQUENCES {
        let mut rng = Rng(seed.wrapping_mul(0x9E37_79B9_7F4A_7C15) | 1);
        let mut run = Run::new(seed);
        for step in 0..STEPS {
            run.step(&mut rng, step);
            if step % 7 == 0 {
                run.advance(&mut rng);
            }
        }
    }
}
