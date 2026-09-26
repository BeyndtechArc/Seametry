//! Runs the shared recipe vectors against the on-chain arithmetic.
//!
//! State is committed after an operation at second zero, or after any step
//! marked `chain`. Other later syncs are evaluated against the committed state
//! without committing, because those vectors record several instants measured
//! from one starting point rather than a chain of consecutive events. The
//! chained scenario exists to catch what only repeated calls can reach.

use hall::recipe::{self, Leg, SyncKind};
use serde_json::Value;

const VECTORS: &str = include_str!("../../../../spec/recipe/vectors.json");

fn field<'a>(step: &'a Value, name: &str) -> &'a str {
    step[name]
        .as_str()
        .unwrap_or_else(|| panic!("step is missing string field {name}: {step}"))
}

fn atoms(step: &Value, name: &str) -> u64 {
    field(step, name)
        .parse()
        .unwrap_or_else(|e| panic!("field {name} is not a u64 in {step}: {e}"))
}

fn kind(name: &str) -> SyncKind {
    match name {
        "unchanged" => SyncKind::Unchanged,
        "credit" => SyncKind::Credit,
        "deficit" => SyncKind::Deficit,
        other => panic!("vector names an unrecognised sync kind {other:?}"),
    }
}

fn assert_state(context: &str, leg: &Leg, supply: u64, step: &Value) {
    assert_eq!(leg.ledger, atoms(step, "ledger"), "{context}: ledger");
    assert_eq!(leg.pending, atoms(step, "pending"), "{context}: pending");
    assert_eq!(
        leg.unclaimed,
        atoms(step, "unclaimed"),
        "{context}: unclaimed"
    );
    assert_eq!(supply, atoms(step, "supply"), "{context}: supply");
}

#[test]
fn vest_window_matches_the_vectors() {
    let file: Value = serde_json::from_str(VECTORS).unwrap();
    assert_eq!(
        file["vest_window_seconds"].as_i64(),
        Some(recipe::VEST_WINDOW_SECONDS)
    );
}

#[test]
fn every_scenario_matches() {
    let file: Value = serde_json::from_str(VECTORS).unwrap();
    let scenarios = file["scenarios"].as_array().unwrap();
    assert!(!scenarios.is_empty(), "no scenarios loaded");

    for scenario in scenarios {
        let name = scenario["name"].as_str().unwrap();
        let mut leg = Leg::default();
        let mut supply = 0u64;

        for (index, step) in scenario["steps"].as_array().unwrap().iter().enumerate() {
            let context = format!("{name}, step {index}");
            match field(step, "op") {
                "initial" => {
                    leg = Leg {
                        ledger: atoms(step, "ledger"),
                        pending: atoms(step, "pending"),
                        unclaimed: atoms(step, "unclaimed"),
                        vest_start: 0,
                        vest_end: recipe::VEST_WINDOW_SECONDS,
                        ..Leg::default()
                    };
                    supply = atoms(step, "supply");
                }
                "sync" => {
                    let at = step["at_seconds"].as_i64().unwrap_or(0);
                    let outcome = recipe::sync(&leg, atoms(step, "actual"), at)
                        .unwrap_or_else(|e| panic!("{context}: {e:?}"));
                    assert_eq!(outcome.kind, kind(field(step, "kind")), "{context}: kind");
                    assert_state(&context, &outcome.after, supply, step);
                    if at == 0 || step["chain"].as_bool().unwrap_or(false) {
                        leg = outcome.after;
                    }
                }
                "create" => {
                    let shares = atoms(step, "shares");
                    let inputs = recipe::create_inputs(&[leg], supply, shares, &[u64::MAX])
                        .unwrap_or_else(|e| panic!("{context}: {e:?}"));
                    assert_eq!(
                        inputs[0],
                        atoms(step, "result"),
                        "{context}: required input"
                    );
                    recipe::apply_create(&mut leg, inputs[0]).unwrap();
                    supply += shares;
                    assert_state(&context, &leg, supply, step);
                }
                "redeem" => {
                    let shares = atoms(step, "shares");
                    let legs = recipe::redeem_legs(&[leg], supply, shares)
                        .unwrap_or_else(|e| panic!("{context}: {e:?}"));
                    assert_eq!(legs[0], atoms(step, "result"), "{context}: leg");
                    recipe::apply_redeem(&mut leg, legs[0]).unwrap();
                    supply -= shares;
                    assert_state(&context, &leg, supply, step);
                }
                other => panic!("{context}: vector names an unrecognised op {other:?}"),
            }
        }
    }
}
