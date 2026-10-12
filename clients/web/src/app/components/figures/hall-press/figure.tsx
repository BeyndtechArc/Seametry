import { formatBalance } from "@/lib/amount";
import { CHITS_PER_LEG, pressSvg } from "./art";
import { LEGS, MOVES, STACK_MAX } from "./geometry";
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
  const readout = `One share holds ${legs.map((leg) => `${formatBalance(BigInt(leg.perShare), SCALE)} ${leg.symbol}`).join(", ")}. Strike, Melt, or freeze a leg.`;
  return (
    <figure className={styles.press} aria-label="The Hall's press">
      <HallPressLive
        svg={pressSvg()}
        moves={MOVES}
        legs={legs}
        initialSupply={Number(INITIAL_SUPPLY)}
        stackMax={STACK_MAX}
        chitsPerLeg={CHITS_PER_LEG}
        initialReadout={readout}
      />
      <figcaption className={styles.caption}>
        Illustrative Formula and quantities; the arithmetic is the Hall&apos;s. Canisters show what the Hall holds for every share, the stack holds the shares, and the rack files Claims. A frozen leg closes its gate: Strike is refused and Melt still works.
      </figcaption>
    </figure>
  );
}
