import survey from "../../../../../shared/evidence/multiplier-staleness-2026-09-23.json";
import firstDepthCapture from "../../../../../shared/evidence/depth-2026-09-24.json";
import latestDepthCapture from "../../../../../shared/evidence/depth-2026-10-04.json";
import devnet from "../../../../../shared/evidence/hall-demo/transcript-devnet.json";
import { admissions, isAdmitted } from "../allocation/admissions";

// Every figure "The exit" states, read from the evidence the Go tools
// committed. The essay types no number of its own, so a new capture
// changes the figure and leaves the prose standing; a figure that has
// no evidence behind it cannot appear.

type DepthPoint = { size_usdc: number; availability: string; shortfall_bps: number | null };
type DepthCapture = { captured_at: string; instruments: { symbol: string; points: DepthPoint[] }[] };

const count = (value: number) => value.toLocaleString("en-GB");

function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

// The ladder is read from the capture rather than assumed, so a capture at
// other sizes reports its own sizes instead of silently finding no point.
function depthSummary(capture: DepthCapture) {
  const ladder = [...new Set(capture.instruments.flatMap((instrument) => instrument.points.map((point) => point.size_usdc)))].sort((a, b) => a - b);
  const [smallest, middle] = ladder;
  const largest = ladder[ladder.length - 1];
  const at = (points: DepthPoint[], size: number) => points.find((point) => point.size_usdc === size);
  const routed = capture.instruments.filter((instrument) => at(instrument.points, smallest)?.availability === "available");
  return {
    date: day(capture.captured_at),
    largestUsdc: largest,
    sizes: ladder.map(count),
    middle: count(middle),
    largest: count(largest),
    measured: capture.instruments.length,
    routedAtSmallest: routed.length,
    unrouted: capture.instruments.length - routed.length,
    shortfall: routed
      .map((instrument) => ({ symbol: instrument.symbol, middle: at(instrument.points, middle)?.shortfall_bps, largest: at(instrument.points, largest)?.shortfall_bps }))
      .filter((row): row is { symbol: string; middle: number; largest: number | null | undefined } => typeof row.middle === "number")
      .sort((a, b) => a.middle - b.middle)
      .map((row) => ({ symbol: row.symbol, middle: count(row.middle), largest: typeof row.largest === "number" ? count(row.largest) : null })),
  };
}

function freezeRun() {
  const scenario = devnet.scenarios.find((candidate) => candidate.id === "freeze");
  if (!scenario) throw new Error('shared/evidence/hall-demo/transcript-devnet.json has no scenario with id "freeze"; the paper links that run, so regenerate the transcript from chain/tools/devnet-demo');
  return {
    cluster: devnet.producer.cluster,
    steps: scenario.steps.map((step) => ({
      actor: step.actor,
      action: step.action,
      result: step.result,
      reason: "reason" in step ? (step.reason as string) : undefined,
      signature: "signature" in step ? (step.signature as string) : undefined,
    })),
  };
}

const splits = survey.stale
  .filter((mint) => mint.naive_value === "1" && /^\d+$/.test(mint.live_value) && mint.live_value !== "1")
  .map((mint) => ({ symbol: mint.symbol, field: mint.naive_value, live: mint.live_value, since: day(mint.effective_at) }));

const firstDepth = depthSummary(firstDepthCapture as DepthCapture);
const latestDepth = depthSummary(latestDepthCapture as DepthCapture);
const admitted = admissions.instruments.filter(isAdmitted);

export const theExit = {
  survey: {
    everyMintFreezableAndSeizable: survey.with_freeze_authority === survey.mints_decoded && survey.with_permanent_delegate === survey.mints_decoded,
    date: day(survey.captured_at),
    slot: count(survey.slot),
    decoded: count(survey.mints_decoded),
    permanentDelegate: count(survey.with_permanent_delegate),
    freezeAuthority: count(survey.with_freeze_authority),
    hookDisabled: count(survey.with_transfer_hook_initialized_disabled),
    hookActive: survey.with_transfer_hook_active,
    halted: survey.halted_by_issuer,
    unknownExtensions: Object.keys(survey.unknown_extensions).length,
    scaledUi: count(survey.with_scaled_ui_amount),
    staleField: survey.stale_multiplier_field,
    scheduledNotYetEffective: survey.activation_scheduled_not_yet_effective,
    splits,
  },
  firstDepth,
  latestDepth,
  admissions: {
    policy: admissions.policy_version,
    captured: admissions.instruments.length,
    admitted: admitted.length,
    atLargestSize: admitted
      .filter((admission) => admission.capacity_usdc >= latestDepth.largestUsdc)
      .map((admission) => admission.instrument.symbol ?? admission.instrument.mint),
  },
  freeze: freezeRun(),
};
