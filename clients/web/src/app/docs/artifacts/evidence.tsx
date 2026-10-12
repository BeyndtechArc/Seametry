import { Grade, gradeDefinitions, type GradeName } from "@seametry/ui";
import { admissions, gradeOf } from "@/lib/allocation/admissions";
import { relativeEvidenceAge } from "@/lib/storm-fixture";
import { InstrumentPicker, type ExplorerInstrument } from "./instrument-picker";
import styles from "./artifacts.module.css";

// Everything on this file's figures comes from shared/evidence/admissions.json,
// the policy engine's output, read at build time. Nothing is typed by hand.
const instruments = admissions.instruments;
const provenance = `Policy engine ${admissions.policy_version}, ${instruments.length} captured instruments, decisions resolved at ${new Date(admissions.as_of).toUTCString().slice(5, 16)} (${relativeEvidenceAge(admissions.as_of)} ago).`;

const grades: GradeName[] = ["Entitlement", "Certificate", "Interest", "Ungraded"];

/**
 * Horizontal bars as an HTML list, so labels keep their real type size on a
 * phone; only each bar is SVG, sized by attribute, since the nonce policy
 * refuses style attributes. Bars are scaled against every captured
 * instrument, not the largest bar, so a full bar means "all of them" and the
 * axis cannot exaggerate.
 */
function Bars({ label, rows, of }: { label: string; rows: { name: string; count: number }[]; of: number }) {
  return (
    <ol className={styles.bars} aria-label={label}>
      {rows.map((row) => (
        <li key={row.name}>
          <span>{row.name}</span>
          <svg viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true">
            <rect x="0" y="0" width="100" height="4" className={styles.barTrack} />
            <rect x="0" y="0" width={Math.max((row.count / Math.max(of, 1)) * 100, 0.5)} height="4" className={styles.bar} />
          </svg>
          <b>{row.count} of {of}</b>
        </li>
      ))}
    </ol>
  );
}

export function GradeTable() {
  const counts = grades.map((name) => ({ name, count: instruments.filter((instrument) => gradeOf(instrument) === name).length }));
  return (
    <figure className={styles.artifact} aria-label="What each Grade means">
      <table className={styles.table}>
        <thead>
          <tr><th scope="col">Grade</th><th scope="col">What the token gives you</th><th scope="col">Captured</th></tr>
        </thead>
        <tbody>
          {counts.map((row) => (
            <tr key={row.name}>
              <td><Grade name={row.name} /></td>
              <td>{gradeDefinitions[row.name]}</td>
              <td>{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <figcaption>{provenance}</figcaption>
    </figure>
  );
}

export function PowerCounts() {
  const counts = new Map<string, number>();
  for (const instrument of instruments) {
    for (const prerogative of instrument.instrument.prerogatives) counts.set(prerogative.sentence, (counts.get(prerogative.sentence) ?? 0) + 1);
  }
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([sentence, count]) => ({ name: sentence.replace(/^The issuer can /, "").replace(/\.$/, ""), count }));
  return (
    <figure className={styles.artifact} aria-label="How many captured instruments carry each issuer power">
      <p className={styles.chartTitle}>The issuer can&hellip;, by number of instruments ({instruments.length} captured)</p>
      <Bars label={`Issuer powers across ${instruments.length} captured instruments`} rows={rows} of={instruments.length} />
      <figcaption>{provenance} Each power is decoded from the mint account&apos;s bytes, not from the issuer&apos;s description.</figcaption>
    </figure>
  );
}

export function InstrumentExplorer() {
  const entries: ExplorerInstrument[] = instruments
    .map((instrument) => ({
      // A mint whose metadata names no symbol is shown by its address, as the offer does, never dropped.
      symbol: instrument.instrument.symbol ?? instrument.instrument.mint,
      issuer: instrument.issuer,
      mint: instrument.instrument.mint,
      grade: gradeOf(instrument),
      powers: instrument.instrument.prerogatives.map((prerogative) => prerogative.sentence),
      decision: instrument.capacity_decision.decision,
      reasons: instrument.capacity_decision.reasons.filter((reason) => reason.severity !== "ALLOW").map((reason) => ({ severity: reason.severity, fact: reason.fact })),
      capacity: instrument.capacity_usdc,
      slot: instrument.instrument.capture.slot,
      capturedAt: instrument.instrument.capture.captured_at,
    }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
  return <InstrumentPicker instruments={entries} provenance={provenance} initial="AAPLx" />;
}
