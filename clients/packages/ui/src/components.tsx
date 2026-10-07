import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import { Icon, type IconName } from "./icons";
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

/** components.md, Mark line: grade and verdict on one line, the reason on its own beneath, spread to the row's height. */
export function MarkLine({ grade, stamp, reason }: { grade: GradeName; stamp: StampKind; reason: string }) {
  return (
    <div className={styles.markLine}>
      <Grade name={grade} />
      <span className={styles.markDivider} aria-hidden="true" />
      <strong className={classes(styles.stamp, styles[`stamp_${stamp}`])}>{stampLabels[stamp]}</strong>
      <span className={styles.markReason}>{reason}</span>
    </div>
  );
}

// A plain img, not next/image: this package is framework-free, and next/image
// writes an inline style the site's CSP refuses.
const lotMarkSizes = { row: "", list: styles.lotMarkList, header: styles.lotMarkHeader } as const;

/** row beside a one-line symbol, list beside a symbol with a second line, header beside a title. */
export function LotMark({ symbol, src, size = "row" }: { symbol: string; src?: string; size?: keyof typeof lotMarkSizes }) {
  const className = `${styles.lotMark} ${lotMarkSizes[size]}`;
  if (src) {
    return <img className={className} src={src} alt="" width={40} height={40} data-testid="lot-mark" />;
  }
  return (
    <span className={`${className} ${styles.lotMarkLettered}`} aria-hidden="true" data-testid="lot-mark">
      {symbol.slice(0, 2)}
    </span>
  );
}

// A details element, not a hover tooltip: it opens on tap as well as click,
// is reachable by keyboard and announced as expandable, and needs no script,
// so it renders in server components under the strict script policy.
export function InfoNote({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className={styles.infoNote}>
      <summary aria-label={label} title={label}>
        <Icon name="info" width={20} height={20} />
      </summary>
      <div className={styles.infoNotePanel}>{children}</div>
    </details>
  );
}

export type FilterGroup = {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
};

/**
 * components.md, Filter bar. Each group's first option is its widest, so a
 * group is "on" when it holds any other. `note` says what the narrowing did
 * to a plan, when rows are choices in one.
 */
export function FilterBar({
  searchLabel,
  query,
  onQuery,
  groups,
  shown,
  total,
  note,
}: {
  searchLabel: string;
  query: string;
  onQuery: (query: string) => void;
  groups: FilterGroup[];
  shown: number;
  total: number;
  note?: string;
}) {
  const on = groups.filter((group) => group.value !== group.options[0]?.value).length;
  return (
    <div className={styles.filterBar}>
      <div className={styles.filterRow}>
        <label className={styles.searchField}>
          <Icon name="search" width={18} height={18} />
          <input type="search" value={query} placeholder={searchLabel} aria-label={searchLabel} autoComplete="off" onChange={(event) => onQuery(event.target.value)} />
        </label>
        <details className={styles.filterMenu}>
          <summary aria-label={on > 0 ? `Filters, ${on} on` : "Filters"} title="Filters">
            <Icon name="filter" width={20} height={20} />
            {on > 0 ? <b aria-hidden="true">{on}</b> : null}
          </summary>
          <div className={styles.filterPanel}>
            {groups.map((group) => (
              <fieldset key={group.name} className={styles.filterGroup}>
                <legend>{group.label}</legend>
                <div>
                  {group.options.map((option) => (
                    <label key={option.value} className={styles.filterOption}>
                      <input type="radio" name={group.name} value={option.value} checked={group.value === option.value} onChange={() => group.onChange(option.value)} />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </details>
      </div>
      <p className={styles.filterCount} aria-live="polite">
        Showing {shown} of {total}.{note ? ` ${note}` : ""}
      </p>
    </div>
  );
}

const gradeGlyphs: Record<GradeName, IconName> = {
  Entitlement: "entitlement",
  Certificate: "certificate",
  Interest: "interest",
  Ungraded: "ungraded",
};

export function Grade({ name }: { name: GradeName }) {
  return (
    <span className={styles.grade} tabIndex={0} title={gradeDefinitions[name]} aria-label={`${name}. ${gradeDefinitions[name]}`}>
      <Icon name={gradeGlyphs[name]} width={14} height={14} />
      <b>{name}</b>
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
          <span className={styles.actionLabel}>{busy ? busyLabel ?? "Working" : children}</span>
          <span className={styles.actionIcon}><Icon name="key" /></span>
        </button>
      </span>
      {disabled && disabledReason ? <span className={styles.controlReason}>{disabledReason}</span> : null}
    </span>
  );
}

export function RouteAction({
  children,
  icon = "arrow-up-right",
  ...anchorProps
}: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; icon?: IconName }) {
  return (
    <a {...anchorProps} className={classes(styles.routeAction, anchorProps.className)}>
      <span className={styles.actionLabel}>{children}</span>
      <span className={styles.actionIcon}><Icon name={icon} /></span>
    </a>
  );
}

export function QuietLink({
  children,
  icon,
  ...anchorProps
}: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; icon?: IconName }) {
  return (
    <a {...anchorProps} className={classes(styles.quietAction, styles.quietLink, anchorProps.className)}>
      <span className={styles.actionLabel}>{children}</span>
      {icon ? <span className={styles.actionIcon}><Icon name={icon} /></span> : null}
    </a>
  );
}

export function TextAction({
  children,
  icon = "arrow-up-right",
  ...anchorProps
}: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; icon?: IconName }) {
  return (
    <a {...anchorProps} className={classes(styles.textAction, anchorProps.className)}>
      <span className={styles.actionLabel}>{children}</span>
      <span className={styles.actionIcon}><Icon name={icon} /></span>
    </a>
  );
}

export function QuietAction({ children, icon, ...buttonProps }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; icon?: IconName }) {
  return (
    <button {...buttonProps} className={classes(styles.quietAction, buttonProps.className)}>
      <span className={styles.actionLabel}>{children}</span>
      {icon ? <span className={styles.actionIcon}><Icon name={icon} /></span> : null}
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

export type QuoteLine = { label: string; value: string };

/**
 * components.md, Quote block: the floor is the promise and outranks the
 * estimate, so it leads and is set larger. The expiry is supplied by the
 * caller, which owns the clock; an expired quote shows the standard phrase
 * in place of the countdown.
 */
export function QuoteBlock({
  floor,
  expected,
  unit,
  fees,
  route,
  received,
  secondsLeft,
}: {
  floor: string;
  expected: string;
  unit: string;
  fees: QuoteLine[];
  route: string;
  received: { relative: string; absolute: string };
  secondsLeft: number;
}) {
  const expired = secondsLeft <= 0;
  return (
    <section className={styles.quoteBlock} data-expired={expired || undefined} aria-label={`Quote for ${unit}`}>
      <div className={styles.quoteFloor}>
        <span>You receive no less than</span>
        <b>{floor}</b>
        <small>{unit}</small>
      </div>
      <div className={styles.quoteExpected}>
        <span>Expected</span>
        <b>{expected}</b>
        <small>{unit}</small>
      </div>
      <dl className={styles.quoteLines}>
        {fees.map((fee) => (
          <div key={fee.label}>
            <dt>{fee.label}</dt>
            <dd>{fee.value}</dd>
          </div>
        ))}
        <div>
          <dt>Route</dt>
          <dd>{route}</dd>
        </div>
      </dl>
      <footer className={styles.quoteExpiry}>
        <Timestamp kind="Received" relative={received.relative} absolute={received.absolute} />
        {/* Only the expiry is announced: a live region around a per-second countdown floods a screen reader. */}
        {expired ? <span role="status">This quote expired. Refresh to see current terms.</span> : <span>Expires in {secondsLeft}s</span>}
      </footer>
    </section>
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

export type StepState = "waiting" | "now" | "done" | "stopped";

export type RegisterStep = {
  title: string;
  /** The step's own glyph, shown while it waits. */
  glyph: IconName;
  state: StepState;
  /** One short line, shown only while the step runs. */
  note?: string;
  /** Required when stopped: the plain account, then the raw message behind a disclosure. */
  problem?: { plain: string; technical?: string };
};

const stepWords: Record<StepState, string> = { waiting: "Waiting", now: "Running", done: "Done", stopped: "Stopped" };
const stepMarks: Record<Exclude<StepState, "waiting">, IconName> = { now: "running", done: "check", stopped: "close" };

export function StepRegister({ steps, label }: { steps: RegisterStep[]; label: string }) {
  return (
    <ol className={styles.stepRegister} aria-label={label} aria-live="polite" data-testid="step-register">
      {steps.map((step) => (
        <li key={step.title} data-state={step.state}>
          <span className={styles.stepMark} aria-hidden="true">
            <Icon name={step.state === "waiting" ? step.glyph : stepMarks[step.state]} />
          </span>
          <div className={styles.stepBody}>
            <b>
              {step.title}
              <span className={styles.srOnly}>, {stepWords[step.state]}</span>
            </b>
            {step.state === "now" && step.note ? <p>{step.note}</p> : null}
            {step.state === "stopped" && step.problem ? (
              <div className={styles.stepProblem} role="alert">
                <p>{step.problem.plain}</p>
                {step.problem.technical ? (
                  <details>
                    <summary>Technical detail</summary>
                    <pre>{step.problem.technical}</pre>
                  </details>
                ) : null}
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
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
