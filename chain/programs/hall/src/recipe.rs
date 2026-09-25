//! The Hall's arithmetic: what a strike costs, what a melt returns, and how a
//! ledger reconciles with a balance an issuer moved.
//!
//! It is bound to `internal/basket` in the Go repository by
//! `spec/recipe/vectors.json`, which both test suites load. A one unit
//! disagreement is a basket that does not balance, so the vectors are the
//! specification and neither implementation is.
//!
//! Nothing here reads a price or the clock. Every rounding favours the Hall:
//! required inputs round up, outputs round down.

/// Vesting window for an upward credit. Compiled in, so a holder can verify it
/// from the deployed bytecode. Must equal `vest_window_seconds` in the vectors.
pub const VEST_WINDOW_SECONDS: i64 = 3600;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecipeError {
    ZeroSupply,
    ZeroShares,
    SharesExceedSupply { shares: u64, supply: u64 },
    Overflow,
    DeficitExceedsHoldings { remaining: u64 },
    ExceedsMaximum { required: u64, maximum: u64 },
    ClaimHasNoIndex,
    ClaimEpochAhead,
    ClaimIndexBelowLeg,
    ExceedsUnclaimed { requested: u64, unclaimed: u64 },
}

pub type Result<T> = core::result::Result<T, RecipeError>;

/// One instrument's position inside an alloy. After every sync the actual
/// token balance equals `ledger + pending + unclaimed`.
///
/// `ledger` backs outstanding shares, `pending` is credited but not yet vested,
/// `unclaimed` is owed to holders who melted and have not withdrawn.
/// `vest_start` is when the current `pending` began vesting; a new credit
/// restarts it, which stops a donor timing a deposit against their own strike.
///
/// `claim_index` and `claim_epoch` record how far seizures have shrunk every
/// outstanding claim, see `ClaimLeg`. A zero index means no seizure has touched
/// `unclaimed`, which is `CLAIM_ONE`, so a zeroed account is already correct.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Leg {
    pub ledger: u64,
    pub pending: u64,
    pub unclaimed: u64,
    pub vest_start: i64,
    pub claim_index: u128,
    pub claim_epoch: u64,
}

/// 1.0 in 64 bit fixed point. A u64 times an index no larger than this stays
/// inside u128, so no claim arithmetic can overflow.
pub const CLAIM_ONE: u128 = 1 << 64;

impl Leg {
    pub fn index(&self) -> u128 {
        if self.claim_index == 0 {
            CLAIM_ONE
        } else {
            self.claim_index
        }
    }

    pub fn expected(&self) -> Result<u64> {
        self.ledger
            .checked_add(self.pending)
            .and_then(|sum| sum.checked_add(self.unclaimed))
            .ok_or(RecipeError::Overflow)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncKind {
    Unchanged,
    Credit,
    Deficit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SyncOutcome {
    pub kind: SyncKind,
    pub delta: u64,
    pub vested_in: u64,
    pub after: Leg,
}

fn mul_div_floor(a: u64, b: u64, divisor: u64) -> Result<u64> {
    if divisor == 0 {
        return Err(RecipeError::ZeroSupply);
    }
    let quotient = (a as u128) * (b as u128) / (divisor as u128);
    u64::try_from(quotient).map_err(|_| RecipeError::Overflow)
}

fn mul_div_ceil(a: u64, b: u64, divisor: u64) -> Result<u64> {
    if divisor == 0 {
        return Err(RecipeError::ZeroSupply);
    }
    let product = (a as u128) * (b as u128);
    let divisor = divisor as u128;
    let quotient = product / divisor + u128::from(product % divisor != 0);
    u64::try_from(quotient).map_err(|_| RecipeError::Overflow)
}

/// What a caller must deposit of one constituent to mint `shares`:
/// `ceil(shares * ledger / supply)`.
pub fn required_in(leg: &Leg, shares: u64, supply: u64) -> Result<u64> {
    mul_div_ceil(leg.ledger, shares, supply)
}

/// What burning `shares` credits of one constituent:
/// `floor(shares * ledger / supply)`.
pub fn out(leg: &Leg, shares: u64, supply: u64) -> Result<u64> {
    mul_div_floor(leg.ledger, shares, supply)
}

/// How much of `pending` has vested at `now`. Linear, clamped at both ends, so
/// a donation cannot lift share value inside a single block.
pub fn vested(leg: &Leg, now: i64) -> Result<u64> {
    if leg.pending == 0 {
        return Ok(0);
    }
    let elapsed = now.saturating_sub(leg.vest_start);
    if elapsed <= 0 {
        return Ok(0);
    }
    if elapsed >= VEST_WINDOW_SECONDS {
        return Ok(leg.pending);
    }
    mul_div_floor(leg.pending, elapsed as u64, VEST_WINDOW_SECONDS as u64)
}

/// Reconciles one constituent against the balance actually held.
///
/// Vested pending folds into the ledger first. A surplus becomes pending and
/// restarts the vest for the whole pending balance. A deficit consumes pending
/// first and only then falls on ledger and unclaimed in proportion.
pub fn sync(leg: &Leg, actual: u64, now: i64) -> Result<SyncOutcome> {
    let vested_in = vested(leg, now)?;
    let mut after = *leg;
    after.ledger = leg
        .ledger
        .checked_add(vested_in)
        .ok_or(RecipeError::Overflow)?;
    after.pending -= vested_in;

    let expected = after.expected()?;
    let (kind, delta) = if actual == expected {
        (SyncKind::Unchanged, 0)
    } else if actual > expected {
        let surplus = actual - expected;
        after.pending = after
            .pending
            .checked_add(surplus)
            .ok_or(RecipeError::Overflow)?;
        after.vest_start = now;
        (SyncKind::Credit, surplus)
    } else {
        let deficit = expected - actual;
        after = apply_deficit(after, deficit)?;
        (SyncKind::Deficit, deficit)
    };
    Ok(SyncOutcome {
        kind,
        delta,
        vested_in,
        after,
    })
}

/// Takes a loss from pending first, then splits the rest between ledger and
/// unclaimed in proportion to their sizes. Unclaimed rounds down so the ledger
/// carries the remainder: an unclaimed entitlement is a fixed quantity owed to a
/// named party, while the ledger is shared across every holder.
fn apply_deficit(mut leg: Leg, deficit: u64) -> Result<Leg> {
    let from_pending = leg.pending.min(deficit);
    leg.pending -= from_pending;
    let remaining = deficit - from_pending;
    if remaining == 0 {
        return Ok(leg);
    }

    let base = leg
        .ledger
        .checked_add(leg.unclaimed)
        .ok_or(RecipeError::Overflow)?;
    if base == 0 {
        return Err(RecipeError::DeficitExceedsHoldings { remaining });
    }
    let from_unclaimed = mul_div_floor(remaining, leg.unclaimed, base)?.min(leg.unclaimed);
    let from_ledger = remaining - from_unclaimed;
    if from_ledger > leg.ledger {
        return Err(RecipeError::DeficitExceedsHoldings { remaining });
    }
    leg.ledger -= from_ledger;
    let unclaimed_before = leg.unclaimed;
    leg.unclaimed -= from_unclaimed;
    shrink_claims(leg, unclaimed_before)
}

/// Records that `unclaimed` fell from `before` to its current value.
///
/// Every claim is worth the same fraction of what it was, so the index falls by
/// that fraction, rounded down. When nothing is left, or the fraction is too
/// small for the index to hold, the leg starts a new epoch and older claims
/// settle to zero.
fn shrink_claims(mut leg: Leg, before: u64) -> Result<Leg> {
    if leg.unclaimed == before {
        return Ok(leg);
    }
    if leg.unclaimed == 0 {
        return start_new_epoch(leg);
    }
    let index = leg.index() * u128::from(leg.unclaimed) / u128::from(before);
    if index == 0 {
        return start_new_epoch(leg);
    }
    leg.claim_index = index;
    Ok(leg)
}

fn start_new_epoch(mut leg: Leg) -> Result<Leg> {
    leg.claim_epoch = leg
        .claim_epoch
        .checked_add(1)
        .ok_or(RecipeError::Overflow)?;
    leg.claim_index = CLAIM_ONE;
    Ok(leg)
}

/// One owner's entitlement to one constituent after melting.
///
/// `units` are fixed quantities until a seizure, and then they shrink in the
/// same proportion as the leg's `unclaimed`. The leg keeps an index that only
/// falls and each claim remembers the index it was last settled against, so a
/// seizure never has to touch every claim. `index` is zero while `units` is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct ClaimLeg {
    pub units: u64,
    pub index: u128,
    pub epoch: u64,
}

fn rebase(claim: ClaimLeg, leg: &Leg) -> ClaimLeg {
    ClaimLeg {
        index: leg.index(),
        epoch: leg.claim_epoch,
        ..claim
    }
}

/// Brings a claim up to date with every seizure since it was last touched.
pub fn settle(claim: &ClaimLeg, leg: &Leg) -> Result<ClaimLeg> {
    if claim.units == 0 {
        return Ok(rebase(*claim, leg));
    }
    if claim.index == 0 {
        return Err(RecipeError::ClaimHasNoIndex);
    }
    if claim.epoch > leg.claim_epoch {
        return Err(RecipeError::ClaimEpochAhead);
    }
    if claim.epoch < leg.claim_epoch {
        return Ok(rebase(ClaimLeg { units: 0, ..*claim }, leg));
    }
    if claim.index < leg.index() {
        return Err(RecipeError::ClaimIndexBelowLeg);
    }
    let units = u128::from(claim.units) * leg.index() / claim.index;
    let units = u64::try_from(units).map_err(|_| RecipeError::Overflow)?;
    Ok(rebase(ClaimLeg { units, ..*claim }, leg))
}

/// Adds units to a claim after a melt moved them from the ledger to `unclaimed`.
/// The claim is settled first, so units credited now are not scaled by seizures
/// that happened before they existed.
pub fn credit_claim(claim: &ClaimLeg, leg: &Leg, units: u64) -> Result<ClaimLeg> {
    let mut settled = settle(claim, leg)?;
    settled.units = settled
        .units
        .checked_add(units)
        .ok_or(RecipeError::Overflow)?;
    Ok(settled)
}

/// Delivers units of a claim, reducing the leg's `unclaimed`.
pub fn withdraw_claim(claim: &ClaimLeg, leg: &mut Leg, units: u64) -> Result<ClaimLeg> {
    let mut settled = settle(claim, leg)?;
    if units > settled.units {
        return Err(RecipeError::ExceedsUnclaimed {
            requested: units,
            unclaimed: settled.units,
        });
    }
    apply_withdraw(leg, units)?;
    settled.units -= units;
    Ok(settled)
}

/// Deposits required to mint `shares`, refusing if any exceeds the caller's
/// stated maximum. The caller names shares and limits, never an amount, so a
/// depositor cannot be rounded down to zero shares.
pub fn create_inputs(legs: &[Leg], supply: u64, shares: u64, maximums: &[u64]) -> Result<Vec<u64>> {
    if shares == 0 {
        return Err(RecipeError::ZeroShares);
    }
    if supply == 0 {
        return Err(RecipeError::ZeroSupply);
    }
    legs.iter()
        .zip(maximums)
        .map(|(leg, &maximum)| {
            let required = required_in(leg, shares, supply)?;
            if required > maximum {
                return Err(RecipeError::ExceedsMaximum { required, maximum });
            }
            Ok(required)
        })
        .collect()
}

/// What burning `shares` credits to a claim, one entry per constituent.
pub fn redeem_legs(legs: &[Leg], supply: u64, shares: u64) -> Result<Vec<u64>> {
    if shares == 0 {
        return Err(RecipeError::ZeroShares);
    }
    if shares > supply {
        return Err(RecipeError::SharesExceedSupply { shares, supply });
    }
    legs.iter().map(|leg| out(leg, shares, supply)).collect()
}

/// Adds deposited units to the ledger.
pub fn apply_create(leg: &mut Leg, input: u64) -> Result<()> {
    leg.ledger = leg.ledger.checked_add(input).ok_or(RecipeError::Overflow)?;
    Ok(())
}

/// Moves redeemed units from the ledger to unclaimed.
pub fn apply_redeem(leg: &mut Leg, units: u64) -> Result<()> {
    leg.ledger = leg.ledger.checked_sub(units).ok_or(RecipeError::Overflow)?;
    leg.unclaimed = leg
        .unclaimed
        .checked_add(units)
        .ok_or(RecipeError::Overflow)?;
    Ok(())
}

/// Delivers one leg of a claim.
pub fn apply_withdraw(leg: &mut Leg, units: u64) -> Result<()> {
    if units > leg.unclaimed {
        return Err(RecipeError::ExceedsUnclaimed {
            requested: units,
            unclaimed: leg.unclaimed,
        });
    }
    leg.unclaimed -= units;
    Ok(())
}
