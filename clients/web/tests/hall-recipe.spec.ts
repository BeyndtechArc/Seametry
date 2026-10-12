import { expect, test } from "@playwright/test";
import vectors from "../../../shared/spec/recipe/vectors.json";
import { melt, strike, type RecipeState } from "../src/lib/hall/recipe";

type Step = { op: string; shares?: string; result?: string; ledger: string; unclaimed: string; supply: string };

// Go seals the vectors and the Rust program reproduces them; the docs' port
// must too, or a reader would be moving numbers the Hall does not compute.
test("the docs' recipe arithmetic replays the shared strike and melt vectors exactly", () => {
  const scenario = vectors.scenarios.find((candidate) => candidate.name === "strike and melt with rounding")!;
  const [initial, ...steps] = scenario.steps as Step[];
  let state: RecipeState = { supply: BigInt(initial.supply), leg: { ledger: BigInt(initial.ledger), unclaimed: BigInt(initial.unclaimed) } };
  expect(steps.length).toBeGreaterThan(0);
  for (const step of steps) {
    const shares = BigInt(step.shares!);
    const next = step.op === "create" ? strike(state, shares) : melt(state, shares);
    const result = "paid" in next ? next.paid : next.credited;
    expect({ op: step.op, shares: step.shares, result: result.toString() }).toEqual({ op: step.op, shares: step.shares, result: step.result });
    state = next.state;
    expect({ ledger: state.leg.ledger.toString(), unclaimed: state.leg.unclaimed.toString(), supply: state.supply.toString() })
      .toEqual({ ledger: step.ledger, unclaimed: step.unclaimed, supply: step.supply });
  }
});
