//! Runs the shared claim vectors against the on-chain arithmetic.
//!
//! Each scenario starts from a leg holding only ledger, then applies operations
//! in order. Every step records the leg and, for a named claim, that claim, so a
//! disagreement with the Go implementation names the exact step and field.

use hall::recipe::{self, ClaimLeg, Leg, CLAIM_ONE};
use serde_json::Value;
use std::collections::HashMap;

const VECTORS: &str = include_str!("../../../../spec/claims/vectors.json");

fn text<'a>(step: &'a Value, name: &str) -> &'a str {
    step[name]
        .as_str()
        .unwrap_or_else(|| panic!("step is missing string field {name}: {step}"))
}

fn atoms(step: &Value, name: &str) -> u64 {
    text(step, name)
        .parse()
        .unwrap_or_else(|e| panic!("field {name} is not a u64 in {step}: {e}"))
}

fn index(step: &Value, name: &str) -> u128 {
    text(step, name)
        .parse()
        .unwrap_or_else(|e| panic!("field {name} is not a u128 in {step}: {e}"))
}

#[test]
fn claim_one_matches_the_vectors() {
    let file: Value = serde_json::from_str(VECTORS).unwrap();
    assert_eq!(index(&file, "claim_one"), CLAIM_ONE);
}

#[test]
fn every_claim_scenario_matches() {
    let file: Value = serde_json::from_str(VECTORS).unwrap();
    let scenarios = file["scenarios"].as_array().unwrap();
    assert!(!scenarios.is_empty(), "no scenarios loaded");

    for scenario in scenarios {
        let name = scenario["name"].as_str().unwrap();
        let mut leg = Leg {
            ledger: atoms(scenario, "ledger"),
            ..Leg::default()
        };
        let mut claims: HashMap<String, ClaimLeg> = HashMap::new();

        for (position, step) in scenario["steps"].as_array().unwrap().iter().enumerate() {
            let context = format!("{name}, step {position} ({})", text(step, "op"));
            let claim_name = step["claim"].as_str().unwrap_or("").to_string();
            let claim = claims.get(&claim_name).copied().unwrap_or_default();

            match text(step, "op") {
                "redeem" => {
                    let units = atoms(step, "units");
                    recipe::apply_redeem(&mut leg, units).unwrap();
                    let credited = recipe::credit_claim(&claim, &leg, units)
                        .unwrap_or_else(|e| panic!("{context}: {e:?}"));
                    claims.insert(claim_name.clone(), credited);
                }
                "sync" => {
                    let outcome = recipe::sync(&leg, atoms(step, "actual"), 0)
                        .unwrap_or_else(|e| panic!("{context}: {e:?}"));
                    leg = outcome.after;
                }
                "settle" => {
                    let settled =
                        recipe::settle(&claim, &leg).unwrap_or_else(|e| panic!("{context}: {e:?}"));
                    claims.insert(claim_name.clone(), settled);
                }
                "withdraw" => {
                    let paid = atoms(step, "units");
                    let after = recipe::withdraw_claim(&claim, &mut leg, paid)
                        .unwrap_or_else(|e| panic!("{context}: {e:?}"));
                    claims.insert(claim_name.clone(), after);
                }
                other => panic!("{context}: vector names an unrecognised op {other:?}"),
            }

            assert_eq!(leg.ledger, atoms(step, "ledger"), "{context}: ledger");
            assert_eq!(leg.pending, atoms(step, "pending"), "{context}: pending");
            assert_eq!(
                leg.unclaimed,
                atoms(step, "unclaimed"),
                "{context}: unclaimed"
            );
            assert_eq!(
                leg.index(),
                index(step, "leg_index"),
                "{context}: leg index"
            );
            assert_eq!(
                leg.claim_epoch,
                step["leg_epoch"].as_u64().unwrap(),
                "{context}: leg epoch"
            );

            if !claim_name.is_empty() {
                let held = claims[&claim_name];
                assert_eq!(
                    held.units,
                    atoms(step, "claim_units"),
                    "{context}: claim units"
                );
                assert_eq!(
                    held.index != 0,
                    step["has_snapshot"].as_bool().unwrap_or(false),
                    "{context}: whether the claim carries an index"
                );
                if held.index != 0 {
                    assert_eq!(
                        held.index,
                        index(step, "claim_index"),
                        "{context}: claim index"
                    );
                    assert_eq!(
                        held.epoch,
                        step["claim_epoch"].as_u64().unwrap_or(0),
                        "{context}: claim epoch"
                    );
                }
            }
        }
    }
}
