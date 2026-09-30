import snapshot from "../../../../../shared/evidence/admissions.json";
import type { Decision, Instrument } from "../terminal-contract";

// shared/evidence/admissions.json is written by the policy engine
// (go run ./server/cmd/explorer -admissions ...) and checked for drift in CI.
// This file reads it and never decides anything itself.

export type Admission = {
  issuer: string;
  decimals: number;
  token_program: string;
  instrument: Instrument;
  decision: Decision;
};

export type AdmissionsSnapshot = {
  producer: string;
  as_of: string;
  policy_version: string;
  reference_usdc: number;
  instruments: Admission[];
};

export const admissions = snapshot as AdmissionsSnapshot;

/**
 * A lot may enter an Allocation unless the policy refused it. WARN admits
 * with its reasons shown, which is how the Explorer's catalogue already
 * reads the same decision ("Admitted").
 */
export function isAdmitted(admission: Admission): boolean {
  return admission.decision.decision !== "BLOCK";
}

export function partitionAdmissions(all: Admission[]) {
  return {
    admitted: all.filter(isAdmitted),
    refused: all.filter((admission) => !isAdmitted(admission)),
  };
}

export function findAdmission(mint: string): Admission | undefined {
  return admissions.instruments.find((admission) => admission.instrument.mint === mint);
}

/** The first reason that blocked a refused lot, stated as the engine wrote it. */
export function blockingFact(admission: Admission): string {
  const blocking = admission.decision.reasons.find((reason) => reason.severity === "BLOCK");
  return blocking?.fact ?? "Refused by the policy engine.";
}
