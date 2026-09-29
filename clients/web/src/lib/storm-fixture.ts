import type { FormulaLedgerLeg, LedgerAmount } from "@seametry/ui";

const scale = 6;

const amount = (atoms: string, amountScale = scale): LedgerAmount => ({
  atoms,
  scale: amountScale,
});

export const stormFixture = {
  source: "Solana devnet transcript, founding scenario",
  sourceCommit: "559c6984c80dfa6f4f66d09076b8f30524fd5755",
  observedAt: "2026-09-28T19:58:13Z",
  programId: "4wmfRdQguyhGCvZe4FXHo7Kpx5aWbRBHPBbs8k6XRjDx",
  foundingSignature: "XP6t4Da5uuWxTsAXizyeQeWfKAdQpX8r1W4QUNTrSPdUVVHPAHGMF9xMJjxfehN2ggXqHU1ZQuhmvd8oXSy6yyH",
  supply: amount("1001000", 0),
  lockedGenesis: amount("1000000", 0),
  legs: [
    {
      symbol: "A",
      name: "Mock stock A",
      grade: "Ungraded",
      unitsPerShare: amount("5"),
      ledger: amount("5005000"),
      pending: amount("0"),
      unclaimed: amount("0"),
      delivery: "Available in the founding state",
    },
    {
      symbol: "B",
      name: "Mock stock B",
      grade: "Ungraded",
      unitsPerShare: amount("3"),
      ledger: amount("3003000"),
      pending: amount("0"),
      unclaimed: amount("0"),
      delivery: "Available in the founding state",
    },
  ] satisfies FormulaLedgerLeg[],
  condition: [
    "The mock issuer can freeze the Hall account for A.",
    "The mock issuer can pause all movement of A.",
    "The mock issuer can take A from the Hall through its permanent delegate.",
    "The Hall accepts a melt while delivery is held back; the claim waits.",
  ],
  conditionEvidence: "Recorded on Solana devnet. These mints are controlled mocks, not claims on a real issuer.",
} as const;

export function relativeEvidenceAge(observedAt: string, now = Date.now()) {
  const elapsedSeconds = Math.max(0, Math.floor((now - Date.parse(observedAt)) / 1000));
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  const elapsedDays = Math.floor(elapsedHours / 24);

  if (elapsedDays > 0) return `${elapsedDays}d`;
  if (elapsedHours > 0) return `${elapsedHours}h`;
  if (elapsedMinutes > 0) return `${elapsedMinutes}m`;
  return `${elapsedSeconds}s`;
}
