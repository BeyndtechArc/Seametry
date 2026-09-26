//! A minimal blocking JSON-RPC client against a Solana cluster.
//!
//! Deliberately not `solana-client`: that crate expects the older monolithic
//! `solana-sdk`, and this workspace already uses the disaggregated
//! `solana-message`/`solana-transaction`/`solana-keypair` crates the litesvm
//! tests use. Reusing exactly those types, plus one HTTP call, needs far less
//! than a full RPC client crate.

use base64::Engine;
use serde_json::{json, Value};
use solana_hash::Hash;
use std::{str::FromStr, thread::sleep, time::Duration};

pub struct Rpc {
    url: String,
}

/// Reduces a JSON-RPC error to the one line a reader needs, the same way
/// `chain/programs/hall/tests/demo_transcript.rs`'s `reason()` reduces
/// litesvm's failure metadata: an Anchor `Error Code: X.` line if one exists,
/// otherwise a raw program's own `Error: X` log line, otherwise the log line
/// immediately before the first `failed:` line (Token-2022's pause message
/// states the fact with no `Error:` prefix at all), otherwise the top level
/// JSON-RPC message with the request's own noise trimmed off.
fn reason(method: &str, error: &Value) -> String {
    let logs: Vec<&str> = error["data"]["logs"]
        .as_array()
        .map(|v| v.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();
    for line in &logs {
        if let Some(rest) = line.split("Error Code: ").nth(1) {
            return rest.split('.').next().unwrap_or(rest).to_string();
        }
    }
    for line in &logs {
        if let Some(rest) = line.strip_prefix("Program log: Error: ") {
            return rest.to_string();
        }
    }
    if let Some(index) = logs.iter().position(|line| line.contains("failed:")) {
        // Solana always inserts a "consumed N of M compute units" runtime line
        // between the last thing a program logged and its "failed:" line, so
        // the line immediately before is never the message; the last actual
        // "Program log: " entry before the failure is.
        if let Some(message) = logs[..index]
            .iter()
            .rev()
            .find_map(|line| line.strip_prefix("Program log: "))
        {
            return message.to_string();
        }
    }
    error["message"]
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| format!("{method} returned an error: {error}"))
}

impl Rpc {
    pub fn new(url: impl Into<String>) -> Self {
        Self { url: url.into() }
    }

    /// A DNS or connection hiccup here does not mean the request's outcome is
    /// unknown, the way one would after `sendTransaction`: nothing has been
    /// submitted yet, so retrying is always safe. Five attempts with a short
    /// backoff survived the resolver failure a real run hit once; an actual
    /// JSON-RPC error response (the request reached the cluster and it said
    /// no) is not retried, since retrying would not change a real answer.
    fn call(&self, method: &str, params: Value) -> Value {
        let body = json!({"jsonrpc": "2.0", "id": 1, "method": method, "params": params});
        let mut last_transport_error = None;
        for attempt in 0..5 {
            if attempt > 0 {
                sleep(Duration::from_millis(500 * attempt as u64));
            }
            match ureq::post(&self.url)
                .set("Content-Type", "application/json")
                .send_json(&body)
            {
                Ok(response) => {
                    let response: Value = response
                        .into_json()
                        .unwrap_or_else(|e| panic!("{method} response was not JSON: {e}"));
                    if let Some(error) = response.get("error") {
                        panic!("{}", reason(method, error));
                    }
                    return response["result"].clone();
                }
                Err(e @ ureq::Error::Transport(_)) => last_transport_error = Some(e.to_string()),
                Err(e) => panic!("{method} request failed: {e}"),
            }
        }
        panic!(
            "{method} request failed after 5 attempts: {}",
            last_transport_error.unwrap()
        );
    }

    pub fn latest_blockhash(&self) -> Hash {
        let raw = self.call("getLatestBlockhash", json!([{"commitment": "confirmed"}]))["value"]
            ["blockhash"]
            .as_str()
            .expect("getLatestBlockhash returned no blockhash")
            .to_string();
        Hash::from_str(&raw).expect("blockhash was not valid base58")
    }

    pub fn minimum_balance_for_rent_exemption(&self, space: usize) -> u64 {
        self.call("getMinimumBalanceForRentExemption", json!([space]))
            .as_u64()
            .expect("getMinimumBalanceForRentExemption returned no value")
    }

    pub fn balance(&self, address: &str) -> u64 {
        self.call("getBalance", json!([address]))["value"]
            .as_u64()
            .expect("getBalance returned no value")
    }

    /// Raw account data, or None if the account does not exist. The data
    /// comes back as `[base64, "base64"]` per the RPC's encoding parameter.
    pub fn account_data(&self, address: &str) -> Option<Vec<u8>> {
        let result = self.call(
            "getAccountInfo",
            json!([address, {"encoding": "base64", "commitment": "confirmed"}]),
        );
        let value = result.get("value")?;
        if value.is_null() {
            return None;
        }
        let encoded = value["data"][0]
            .as_str()
            .expect("account data was not a string");
        Some(
            base64::engine::general_purpose::STANDARD
                .decode(encoded)
                .expect("account data was not valid base64"),
        )
    }

    /// Sends a signed transaction's wire bytes and waits for `confirmed`
    /// commitment, returning the signature. Panics on failure: a demonstration
    /// that silently skipped a failed step would misrepresent what happened.
    pub fn send_and_confirm(&self, wire: &[u8]) -> String {
        let encoded = base64::engine::general_purpose::STANDARD.encode(wire);
        let signature = self
            .call(
                "sendTransaction",
                json!([encoded, {"encoding": "base64", "skipPreflight": false, "preflightCommitment": "confirmed"}]),
            )
            .as_str()
            .expect("sendTransaction returned no signature")
            .to_string();

        for _ in 0..60 {
            let statuses = self.call("getSignatureStatuses", json!([[signature.clone()]]));
            let status = &statuses["value"][0];
            if !status.is_null() {
                if let Some(err) = status.get("err") {
                    if !err.is_null() {
                        panic!("transaction {signature} failed on chain: {err}");
                    }
                }
                let confirmations_null = status["confirmations"].is_null();
                let status_str = status["confirmationStatus"].as_str().unwrap_or("");
                if confirmations_null || status_str == "confirmed" || status_str == "finalized" {
                    return signature;
                }
            }
            sleep(Duration::from_millis(500));
        }
        panic!("transaction {signature} did not confirm within 30 seconds");
    }
}
