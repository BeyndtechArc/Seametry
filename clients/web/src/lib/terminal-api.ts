import "server-only";

import type { TerminalProblem } from "./terminal-contract";

export class TerminalApiError extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    detail: string,
  ) {
    super(detail);
  }
}

function apiRoot() {
  const configured = process.env.SEAMETRY_API_URL?.trim();
  if (!configured) {
    throw new TerminalApiError(
      503,
      "Terminal API unavailable",
      "Set SEAMETRY_API_URL to a deployed or local Gateway.",
    );
  }
  return configured.endsWith("/") ? configured : `${configured}/`;
}

export async function readTerminalApi<T>(path: string): Promise<T> {
  const url = new URL(path.replace(/^\//, ""), apiRoot());
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json, application/problem+json" },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "the Gateway did not answer";
    throw new TerminalApiError(502, "Terminal API did not answer", reason);
  }

  if (!response.ok) {
    const problem = await response.json().catch(() => null) as Partial<TerminalProblem> | null;
    throw new TerminalApiError(
      response.status,
      problem?.title ?? "Terminal API request refused",
      problem?.detail ?? `The Gateway answered HTTP ${response.status}.`,
    );
  }

  return response.json() as Promise<T>;
}

export function terminalProblem(error: unknown): TerminalProblem {
  if (error instanceof TerminalApiError) {
    return { title: error.title, detail: error.message, status: error.status };
  }
  return {
    title: "Terminal API response unreadable",
    detail: error instanceof Error ? error.message : "The response could not be read.",
    status: 502,
  };
}
