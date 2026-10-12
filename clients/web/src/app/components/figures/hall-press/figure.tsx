import { formatBalance } from "@/lib/amount";
import { pressSvg } from "./art";
import { LEGS, MOVES, STACK_MAX, WALLET_DEPTH } from "./geometry";
import { HallPressLive } from "./live";
import styles from "./press.module.css";

// An illustrative Formula, the same one the docs' frozen-leg bench uses, at
// six decimals. The arithmetic that moves it is lib/hall/recipe.ts, which
// replays the Hall's shared vectors in tests/hall-recipe.spec.ts.
const FORMULA = ["2000000", "1500000", "250000"];
const INITIAL_SUPPLY = 3n;
const SCALE = 6;

/** The landing hero: the Hall as a press a reader can operate. */
export function HallPress() {
  const legs = LEGS.map((leg, index) => ({ symbol: leg.symbol, perShare: FORMULA[index] }));
  const status = `One share holds ${legs.map((leg) => `${formatBalance(BigInt(leg.perShare), SCALE)} ${leg.symbol}`).join(", ")}.`;
  return (
    <figure className={styles.figure} aria-label="The Hall's press">
      <HallPressLive
        svg={pressSvg()}
        moves={MOVES}
        legs={legs}
        initialSupply={Number(INITIAL_SUPPLY)}
        stackMax={STACK_MAX}
        walletDepth={WALLET_DEPTH}
        initialStatus={status}
      />
    </figure>
  );
}
