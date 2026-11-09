import type { ReactNode } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { adminAccess, type AdminAccess, type AdminOverview, type AdminQuery } from "@/lib/admin";
import styles from "./record.module.css";

/** The admitted access for a page. The layout already refused anyone else; this keeps a page that renders alone from reading without it. */
export async function admitted(): Promise<Extract<AdminAccess, { state: "admitted" }>> {
  const access = await adminAccess((await headers()).get("cookie"));
  if (access.state !== "admitted") notFound();
  return access;
}

export function age(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 90) return `${seconds} s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export const shortAddress = (address: string) => (address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address || "No wallet yet");
export const utc = (iso: string) => iso.replace("T", " ").replace(/:\d{2}(\.\d+)?Z$/, " UTC");
export const dayOf = (iso: string) => iso.slice(0, 10);

export const chainSource = "Solana mainnet, read by Seametry's reconciler";

/** One title per page and the line that says what was read, when, and for which period. */
export function AdminHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className={styles.header}>
      <h1>{title}</h1>
      {children ? <p>{children}</p> : null}
    </header>
  );
}

type Period = AdminOverview["period"];

export function periodLine(period: Period, readAt: string): string {
  return `${utc(period.from)} to ${utc(period.to)}, ${period.deployment}. Read from the Gateway at ${utc(readAt)}.`;
}

export function RangeForm({ action, query, period }: { action: string; query: AdminQuery; period?: Period }) {
  const lastDay = period ? new Date(Date.parse(period.to) - 1).toISOString() : undefined;
  return (
    <form className={styles.range} method="get" action={action}>
      <label>
        <span>From</span>
        <input type="date" name="from" defaultValue={query.from ?? (period ? dayOf(period.from) : undefined)} />
      </label>
      <label>
        <span>To, inclusive</span>
        <input type="date" name="to" defaultValue={query.to ?? (lastDay ? dayOf(lastDay) : undefined)} />
      </label>
      <DeploymentField value={period?.deployment ?? query.deployment} />
      <button type="submit" className={styles.read}>Read the period</button>
    </form>
  );
}

export function DeploymentForm({ action, deployment }: { action: string; deployment: string }) {
  return (
    <form className={styles.range} method="get" action={action}>
      <DeploymentField value={deployment} />
      <button type="submit" className={styles.read}>Read the deployment</button>
    </form>
  );
}

function DeploymentField({ value }: { value?: string }) {
  return (
    <label>
      <span>Deployment</span>
      <select name="deployment" defaultValue={value ?? "production"}>
        <option value="production">Production</option>
        <option value="preview">Preview</option>
        <option value="development">Development</option>
      </select>
    </label>
  );
}

export function RefusedRange({ detail }: { detail?: string }) {
  return detail ? <p className={styles.absence} role="status">The range was refused: {detail} The last 30 days are shown instead.</p> : null;
}

export function Unavailable({ detail }: { detail: string }) {
  return <p className={styles.absence}>{detail} Nothing from this read is shown.</p>;
}

export function Empty({ children }: { children: string }) {
  return <p className={styles.absence}>{children}</p>;
}

/** A titled part of a page, with the question it answers. */
export function Part({ id, title, question, children }: { id: string; title: string; question: string; children: ReactNode }) {
  return (
    <section className={styles.part} aria-labelledby={id}>
      <header>
        <h2 id={id}>{title}</h2>
        <p>{question}</p>
      </header>
      {children}
    </section>
  );
}

export { styles as recordStyles };
