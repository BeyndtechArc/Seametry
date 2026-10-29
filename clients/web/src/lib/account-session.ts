"use client";

import { useCallback, useEffect, useState } from "react";

export type AccountUser = { id: string; email?: string; emailVerified: boolean; name?: string };

export type AccountSession =
  | { state: "unconfigured" | "reading" | "signed-out" }
  | { state: "signed-in"; user: AccountUser };

const changed = "seametry:account-session";

/** Tells every reader of the session to read it again, after a sign-in or sign-out here. */
export function announceSessionChange() {
  window.dispatchEvent(new Event(changed));
}

function readUser(body: unknown): AccountUser | undefined {
  const user = (body as { user?: Record<string, unknown> } | null)?.user;
  if (!user || typeof user.id !== "string" || !user.id) return undefined;
  return {
    id: user.id,
    email: typeof user.email === "string" ? user.email : undefined,
    emailVerified: user.emailVerified === true,
    name: typeof user.name === "string" ? user.name : undefined,
  };
}

/**
 * The Better Auth session as the browser sees it, read through the
 * first-party proxy. Only an answer naming a user reads as signed in; null,
 * a session without a user, or a failed read reads as signed out. Nothing is
 * read when the account service is not configured.
 */
export function useAccountSession(configured: boolean): AccountSession & { refresh: () => void } {
  const [reading, setReading] = useState<{ round: number; session: AccountSession }>({ round: -1, session: { state: "reading" } });
  const [round, setRound] = useState(0);
  const refresh = useCallback(() => setRound((value) => value + 1), []);

  useEffect(() => {
    window.addEventListener(changed, refresh);
    return () => window.removeEventListener(changed, refresh);
  }, [refresh]);

  useEffect(() => {
    if (!configured) return;
    let current = true;
    fetch("/api/auth/get-session", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : null))
      .catch(() => null)
      .then((body) => {
        if (!current) return;
        const user = readUser(body);
        setReading({ round, session: user ? { state: "signed-in", user } : { state: "signed-out" } });
      });
    return () => { current = false; };
  }, [configured, round]);

  if (!configured) return { state: "unconfigured", refresh };
  if (reading.round === -1) return { state: "reading", refresh };
  return { ...reading.session, refresh };
}
