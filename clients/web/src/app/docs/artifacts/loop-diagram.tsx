import styles from "./artifacts.module.css";

/**
 * A bundle beside an Alloy, drawn from geometry with token-coloured classes.
 * The bundle's arrows stop at the wallet; the Alloy's close into a loop that
 * any wallet can enter from either side.
 */
export function LoopDiagram() {
  return (
    <figure className={styles.artifact} aria-label="A bundle stops at assembly; an Alloy is a loop">
      <svg className={styles.diagram} viewBox="0 0 720 300" role="img" aria-labelledby="loop-title loop-desc">
        <title id="loop-title">A bundle compared with an Alloy</title>
        <desc id="loop-desc">On the left, three tokens arrive in a wallet and nothing else happens. On the right, constituents enter the Hall through Strike and become shares; shares return through Melt and become Claims on every constituent; the loop is open to any wallet.</desc>

        <text x="20" y="28" className={styles.diagramHeading}>A bundle</text>
        {[0, 1, 2].map((index) => (
          <g key={index}>
            <rect x="20" y={60 + index * 64} width="96" height="40" className={styles.diagramToken} />
            <text x="68" y={85 + index * 64} className={styles.diagramLabel}>Token {index + 1}</text>
            <line x1="116" y1={80 + index * 64} x2="208" y2="144" className={styles.diagramArrow} />
          </g>
        ))}
        <rect x="208" y="120" width="96" height="48" className={styles.diagramWallet} />
        <text x="256" y="149" className={styles.diagramLabel}>Wallet</text>
        <text x="20" y="276" className={styles.diagramNote}>Assembly is the end. No share, no Formula, no way back.</text>

        <line x1="350" y1="20" x2="350" y2="280" className={styles.diagramRule} />

        <text x="380" y="28" className={styles.diagramHeading}>An Alloy</text>
        <rect x="380" y="112" width="104" height="64" className={styles.diagramToken} />
        <text x="432" y="140" className={styles.diagramLabel}>Constituents</text>
        <text x="432" y="158" className={styles.diagramSmall}>the Formula</text>
        <rect x="560" y="112" width="120" height="64" className={styles.diagramHall} />
        <text x="620" y="140" className={styles.diagramLabel}>Shares</text>
        <text x="620" y="158" className={styles.diagramSmall}>fixed quantities each</text>

        <path d="M484 124 C 520 72, 530 72, 560 124" className={styles.diagramLoop} />
        <text x="522" y="70" className={styles.diagramVerb}>Strike</text>
        <path d="M560 164 C 530 224, 520 224, 484 164" className={styles.diagramLoop} />
        <text x="522" y="236" className={styles.diagramVerb}>Melt</text>
        <text x="522" y="254" className={styles.diagramSmall}>a Claim on every leg</text>
        <text x="380" y="276" className={styles.diagramNote}>Any wallet can enter from either side. No approval list.</text>
      </svg>
      <figcaption>Strike deposits the Formula and mints shares. Melt burns shares and records a Claim on every constituent, which is withdrawn leg by leg.</figcaption>
    </figure>
  );
}
