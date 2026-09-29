import transcript from "../../../../shared/evidence/hall-demo/transcript-devnet.json";
import { relativeEvidenceAge, stormFixture } from "./storm-fixture";

const freezeScenario = transcript.scenarios.find((scenario) => scenario.id === "freeze");

if (!freezeScenario) {
  throw new Error("The public landing needs the freeze scenario from shared/evidence/hall-demo/transcript-devnet.json");
}

export const publicIncident = {
  source: "Recorded Solana devnet transcript",
  sourceCommit: stormFixture.sourceCommit,
  observedAt: stormFixture.observedAt,
  programId: transcript.producer.program_id,
  title: freezeScenario.title,
  shows: freezeScenario.shows,
  boundary: freezeScenario.does_not_show,
  steps: freezeScenario.steps.map((step) => ({
    actor: step.actor,
    action: step.action,
    result: step.result,
    reason: "reason" in step ? step.reason : undefined,
    signature: "signature" in step ? step.signature : undefined,
  })),
} as const;

export function publicIncidentAge() {
  return relativeEvidenceAge(publicIncident.observedAt);
}
