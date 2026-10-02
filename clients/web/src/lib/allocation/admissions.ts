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
  capacity_usdc: number;
  capacity_decision: Decision;
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
 * A lot may enter an Allocation only when the engine issued a non-zero
 * measured capacity and the decision at that exact size did not refuse it.
 * The reference-size decision remains part of the Explorer record.
 */
export function isAdmitted(admission: Admission): boolean {
  return admission.capacity_usdc > 0 && admission.capacity_decision.decision !== "BLOCK";
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
  const blocking = admission.capacity_decision.reasons.find((reason) => reason.severity === "BLOCK");
  return blocking?.fact ?? "Refused by the policy engine.";
}
