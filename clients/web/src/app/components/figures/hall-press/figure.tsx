import { pressSvg } from "./art";
import { MOVES, STACK_MAX, WALLET_DEPTH } from "./geometry";
import { HallPressLive } from "./live";
import styles from "./press.module.css";

// An illustrative Formula, the same one the docs' frozen-leg bench uses, at
// six decimals. The arithmetic that moves it is lib/hall/recipe.ts, which
// replays the Hall's shared vectors in tests/hall-recipe.spec.ts.
const FORMULA = ["2000000", "1500000", "250000"];
const INITIAL_SUPPLY = 3;

/** The landing hero: the Hall as a press that plays its own story. */
export function HallPress() {
  return (
    <figure className={styles.press} aria-label="The Hall's press">
      <HallPressLive svg={pressSvg()} moves={MOVES} formula={FORMULA} initialSupply={INITIAL_SUPPLY} stackMax={STACK_MAX} walletDepth={WALLET_DEPTH} />
    </figure>
  );
}
