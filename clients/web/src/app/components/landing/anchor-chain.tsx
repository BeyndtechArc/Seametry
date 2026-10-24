import styles from "./landing.module.css";

// What the generated Explorer does with a Hallmark today, and the step it
// stops before: it recomputes the public digest and the Merkle path in the
// visitor's browser, and no batch root is written on chain yet, so it claims
// no on-chain Seal.
const links = [
  { name: "Hallmark", state: "Published" },
  { name: "Public digest", state: "Recomputed in your browser" },
  { name: "Merkle path", state: "Recomputed in your browser" },
  { name: "Root on chain", state: "Not written yet", unbuilt: true },
];

/** components.md, Anchor chain. */
export function AnchorChain() {
  return (
    <ol className={styles.chain} aria-label="How a Hallmark is verified today">
      {links.map((link) => (
        <li key={link.name} data-unbuilt={link.unbuilt ? "" : undefined}>
          <span className={styles.chainNode} aria-hidden="true" />
          <b>{link.name}</b>
          <span>{link.state}</span>
        </li>
      ))}
    </ol>
  );
}
