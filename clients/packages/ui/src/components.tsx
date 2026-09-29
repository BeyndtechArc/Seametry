import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import styles from "./components.module.css";

export type EvidenceState =
  | "verified"
  | "unverified"
  | "stale"
  | "unavailable"
  | "error"
  | "loading"
  | "empty";

export type GradeName = "Entitlement" | "Certificate" | "Interest" | "Ungraded";
type PunchKind = "sponsor" | "grade" | "office" | "date";
type StampKind = "delivery" | "ngd" | "allow" | "warn" | "block";

export type LedgerAmount = {
  atoms: string;
  scale: number;
};

export type FormulaLedgerLeg = {
  symbol: string;
  name: string;
  grade: GradeName;
  unitsPerShare: LedgerAmount;
  ledger: LedgerAmount;
  pending: LedgerAmount;
  unclaimed: LedgerAmount;
  delivery: string;
};

const stateLabels: Record<EvidenceState, string> = {
  verified: "Verified",
  unverified: "Unverified",
  stale: "Stale",
  unavailable: "No observation",
  error: "Observation unavailable",
  loading: "Loading observation",
  empty: "No observation yet",
};

const gradeDefinitions: Record<GradeName, string> = {
  Entitlement: "Redeemable one to one into a security entitlement through a regulated broker.",
  Certificate: "A tracker certificate that settles to cash through its issuer.",
  Interest: "A proportional interest in a vehicle holding private shares.",
  Ungraded: "The legal shape has not been classified.",
};

function classes(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(" ");
}

function shortenDigest(value: string) {
  if (value.length <= 24) return value;
  return `${value.slice(0, 10)}…${value.slice(-10)}`;
}

export function Rule({ label }: { label?: string }) {
  return (
    <div className={styles.rule} role="separator" aria-label={label}>
      <span aria-hidden="true" />
      {label ? <b>{label}</b> : null}
    </div>
  );
}

export function Timestamp({
  kind,
  relative,
  absolute,
}: {
  kind: "Observed" | "Received" | "Effective" | "Settled";
  relative: string;
  absolute: string;
}) {
  return (
    <time className={styles.timestamp} dateTime={absolute} title={absolute} aria-label={`${kind} ${relative}, ${absolute}`}>
      <span>{kind}</span>
      <b>{relative}</b>
    </time>
  );
}

export function Figure({
  label,
  value,
  unit,
  source,
  state,
  age,
  observedAt,
  size = "large",
}: {
  label: string;
  value?: string;
  unit?: string;
  source: string;
  state: EvidenceState;
  age?: string;
  observedAt?: string;
  size?: "regular" | "large";
}) {
  const unavailable = state === "unavailable" || state === "error" || state === "empty";
  const loading = state === "loading";

  return (
    <figure className={classes(styles.figure, styles[size])} data-state={state}>
      <div className={styles.figureRule} aria-hidden="true" />
      <div className={styles.figureValue}>
        {loading ? (
          <span className={styles.loadingRule}>Loading {label.toLowerCase()}</span>
        ) : unavailable ? (
          <span className={styles.figureAbsence}>{stateLabels[state]}</span>
        ) : (
          <>
            <span>{value}</span>
            {unit ? <small>{unit}</small> : null}
          </>
        )}
      </div>
      <figcaption>
        <span className={styles.figureLabel}>{label}</span>
        <span>{source}</span>
        {age && observedAt ? <Timestamp kind="Observed" relative={age} absolute={observedAt} /> : null}
        <span className={styles[state]}>{stateLabels[state]}</span>
      </figcaption>
    </figure>
  );
}

export function Serial({ value, copied = false }: { value: string; copied?: boolean }) {
  return (
    <span className={styles.serial} aria-label={`Serial ${value}`}>
      <span>{value.slice(0, 4)}</span>
      <b>{value.slice(4)}</b>
      {copied ? <em>Serial copied</em> : null}
    </span>
  );
}

export function Digest({ value }: { value: string }) {
  return (
    <code className={styles.digest} tabIndex={0} title={value} aria-label={value}>
      <span aria-hidden="true" />
      <span className={styles.digestShort} aria-hidden="true">{shortenDigest(value)}</span>
      <span className={styles.digestFull} aria-hidden="true">{value}</span>
    </code>
  );
}

function PunchGlyph({ kind }: { kind: PunchKind }) {
  if (kind === "sponsor") {
    return <path d="M6 11.5 12 6l6 5.5V18H6zM9.5 18v-4.5h5V18" />;
  }
  if (kind === "grade") {
    return <ellipse cx="12" cy="12" rx="7" ry="5" />;
  }
  if (kind === "office") {
    return <path d="M6 6h8l4 4v8H6zM14 6v4h4" />;
  }
  return <rect x="5" y="7" width="14" height="10" rx="1" />;
}

export function Punch({ kind, label, detail }: { kind: PunchKind; label: string; detail?: string }) {
  return (
    <span className={styles.punch} data-kind={kind} data-testid="punch" aria-label={`${label}${detail ? ` ${detail}` : ""}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <PunchGlyph kind={kind} />
      </svg>
      {detail ? <b>{detail}</b> : null}
      <span className={styles.srOnly}>{label}</span>
    </span>
  );
}

const stampLabels: Record<StampKind, string> = {
  delivery: "Good Delivery",
  ngd: "Not Good Delivery",
  allow: "Allow",
  warn: "Warn",
  block: "Block",
};

export function Stamp({ kind, reason }: { kind: StampKind; reason: string }) {
  return (
    <span className={styles.stampLine}>
      <strong className={classes(styles.stamp, styles[`stamp_${kind}`])}>{stampLabels[kind]}</strong>
      <span>{reason}</span>
    </span>
  );
}

export function Grade({ name }: { name: GradeName }) {
  return (
    <span className={styles.grade} tabIndex={0} title={gradeDefinitions[name]} aria-label={`${name}. ${gradeDefinitions[name]}`}>
      <span aria-hidden="true" />
      <b>{name}</b>
      <span aria-hidden="true" />
    </span>
  );
}

export function Key({
  children,
  busyLabel,
  busy = false,
  disabledReason,
  ...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  busy?: boolean;
  busyLabel?: string;
  disabledReason?: string;
}) {
  const disabled = buttonProps.disabled || busy;
  return (
    <span className={styles.keyGroup}>
      <span className={styles.keyTray}>
        <button
          {...buttonProps}
          className={classes(styles.key, buttonProps.className)}
          disabled={disabled}
          aria-busy={busy || undefined}
        >
          {busy ? busyLabel ?? "Working" : children}
        </button>
      </span>
      {disabled && disabledReason ? <span className={styles.controlReason}>{disabledReason}</span> : null}
    </span>
  );
}

export function RouteAction({
  children,
  ...anchorProps
}: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode }) {
  return (
    <a {...anchorProps} className={classes(styles.routeAction, anchorProps.className)}>
      {children}
    </a>
  );
}

export function QuietLink({
  children,
  ...anchorProps
}: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode }) {
  return (
    <a {...anchorProps} className={classes(styles.quietAction, styles.quietLink, anchorProps.className)}>
      {children}
    </a>
  );
}

export function TextAction({
  children,
  ...anchorProps
}: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode }) {
  return (
    <a {...anchorProps} className={classes(styles.textAction, anchorProps.className)}>
      <span>{children}</span>
      <span aria-hidden="true" />
    </a>
  );
}

export function QuietAction({ children, ...buttonProps }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button {...buttonProps} className={classes(styles.quietAction, buttonProps.className)}>
      {children}
    </button>
  );
}

export function Field({
  id,
  label,
  message,
  invalid = false,
  ...inputProps
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  message?: string;
  invalid?: boolean;
}) {
  return (
    <label className={styles.fieldGroup} htmlFor={id} data-invalid={invalid || undefined}>
      <span className={styles.fieldLabel}>
        {label}
        <span aria-hidden="true" />
      </span>
      <span className={styles.fieldShell}>
        <input {...inputProps} id={id} aria-invalid={invalid || undefined} aria-describedby={message ? `${id}-message` : undefined} />
      </span>
      {message ? <span className={styles.fieldMessage} id={`${id}-message`}>{message}</span> : null}
    </label>
  );
}

export function EvidenceRow({
  source,
  value,
  unit,
  state,
  relative,
  absolute,
}: {
  source: string;
  value?: string;
  unit?: string;
  state: EvidenceState;
  relative: string;
  absolute: string;
}) {
  return (
    <div className={styles.evidenceRow} data-state={state}>
      <span className={styles.evidenceSource}>{source}</span>
      <span className={styles.evidenceValue}>{value ?? stateLabels[state]}{value && unit ? ` ${unit}` : ""}</span>
      <Timestamp kind="Observed" relative={relative} absolute={absolute} />
      <span className={styles[state]}>{stateLabels[state]}</span>
    </div>
  );
}

function AmountCell({ amount }: { amount: LedgerAmount }) {
  return (
    <span className={styles.ledgerAmount} aria-label={`${amount.atoms} atoms at scale ${amount.scale}`}>
      <b>{amount.atoms}</b>
      <small>atoms · scale {amount.scale}</small>
    </span>
  );
}

export function FormulaLedger({
  legs,
  source,
  state,
  relative,
  absolute,
}: {
  legs: FormulaLedgerLeg[];
  source: string;
  state: EvidenceState;
  relative: string;
  absolute: string;
}) {
  return (
    <div className={styles.formulaLedger} data-testid="formula-ledger">
      <div className={styles.formulaCaption}>
        <span>{source}</span>
        <Timestamp kind="Observed" relative={relative} absolute={absolute} />
        <span className={styles[state]}>{stateLabels[state]}</span>
      </div>
      <div className={styles.formulaScroll}>
        <table>
          <thead>
            <tr>
              <th scope="col">Constituent</th>
              <th scope="col">Units per share</th>
              <th scope="col">Hall ledger</th>
              <th scope="col">Pending</th>
              <th scope="col">Unclaimed</th>
              <th scope="col">Delivery</th>
            </tr>
          </thead>
          <tbody>
            {legs.map((leg) => (
              <tr key={leg.symbol}>
                <th scope="row">
                  <span className={styles.legName}>{leg.name}</span>
                  <span className={styles.legIdentity}>
                    <b>{leg.symbol}</b>
                    <Grade name={leg.grade} />
                  </span>
                </th>
                <td><AmountCell amount={leg.unitsPerShare} /></td>
                <td><AmountCell amount={leg.ledger} /></td>
                <td><AmountCell amount={leg.pending} /></td>
                <td><AmountCell amount={leg.unclaimed} /></td>
                <td className={styles.delivery}>{leg.delivery}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ConditionReport({
  statements,
  evidence,
}: {
  statements: string[];
  evidence: string;
}) {
  return (
    <div className={styles.conditionReport}>
      <ul>
        {statements.map((statement) => <li key={statement}>{statement}</li>)}
      </ul>
      <p>{evidence}</p>
    </div>
  );
}

export function ProvenanceLine({
  links,
}: {
  links: Array<{ name: string; role: string }>;
}) {
  return (
    <ol className={styles.provenanceLine} aria-label="Provenance chain">
      {links.map((link) => (
        <li key={`${link.name}-${link.role}`}>
          <b>{link.name}</b>
          <span>{link.role}</span>
        </li>
      ))}
    </ol>
  );
}

export function HallmarkRow({
  serial,
  sponsor,
  grade,
  office,
  date,
  seal,
}: {
  serial: string;
  sponsor: string;
  grade: GradeName;
  office: string;
  date: string;
  seal: "Unsealed" | "Sealed" | "Verification pending" | "Verified" | "Does not match";
}) {
  return (
    <div className={styles.hallmark} data-testid="hallmark-row">
      <div className={styles.punchLine}>
        <Punch kind="sponsor" label="Sponsor's mark" detail={sponsor} />
        <Punch kind="grade" label="Grade" detail={grade.slice(0, 1)} />
        <Punch kind="office" label="Office" detail={office} />
        <Punch kind="date" label="Date" detail={date} />
      </div>
      <div className={styles.hallmarkFoot}>
        <Serial value={serial} />
        <span>{seal}</span>
      </div>
    </div>
  );
}

export function ClaimLine({ lead, children }: { lead: string; children: ReactNode }) {
  return (
    <article className={styles.claimLine}>
      <h3>{lead}</h3>
      <p>{children}</p>
    </article>
  );
}

export function ProofStrip({
  items,
}: {
  items: Array<{ label: string; value: string; href: string }>;
}) {
  return (
    <div className={styles.proofStrip}>
      {items.map((item) => (
        <div className={styles.proofItem} key={`${item.label}-${item.href}`}>
          <span>{item.label}</span>
          <a href={item.href}>{item.value}</a>
        </div>
      ))}
    </div>
  );
}

export function AgentPanel({
  title,
  description,
  command,
  href,
}: {
  title: string;
  description: string;
  command: string;
  href: string;
}) {
  return (
    <aside className={styles.agentPanel}>
      <div>
        <span>Machine entry</span>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <code>{command}</code>
      <a href={href}>Read the contract</a>
    </aside>
  );
}

export function RegisterFooter({
  groups,
  note,
}: {
  groups: Array<{ title: string; links: Array<{ label: string; href: string }> }>;
  note: string;
}) {
  return (
    <footer className={styles.registerFooter}>
      <div className={styles.footerRegister}>
        {groups.map((group) => (
          <section key={group.title}>
            <h2>{group.title}</h2>
            <ul>
              {group.links.map((link) => (
                <li key={`${link.label}-${link.href}`}><a href={link.href}>{link.label}</a></li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p>{note}</p>
    </footer>
  );
}
