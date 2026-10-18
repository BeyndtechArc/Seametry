import "server-only";

// The Go Gateway's /v1/internal endpoints, reached over the service secret
// the two deployments share. The activity record and feedback both post here;
// neither may ever send the secret to a browser.

let warnedUnconfigured = false;

/** The internal URL and secret, or undefined, with one warning, when this deployment has neither. */
function target(path: string): { url: string; secret: string } | undefined {
  const origin = process.env.SEAMETRY_API_URL?.trim();
  const secret = process.env.ACTIVITY_INGEST_SECRET?.trim();
  if (!origin || !secret) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn(`The Gateway's internal endpoints are unreachable: ${!origin ? "SEAMETRY_API_URL" : "ACTIVITY_INGEST_SECRET"} is not set.`);
    }
    return undefined;
  }
  return { url: `${origin.replace(/\/$/, "")}/v1/internal/${path}`, secret };
}

/** Posts body to /v1/internal/{path}; undefined when unconfigured. Throws only on a network failure or timeout. */
export async function postInternal(path: string, body: unknown, timeoutMs = 5_000): Promise<Response | undefined> {
  const destination = target(path);
  if (!destination) return undefined;
  return fetch(destination.url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-seametry-service-secret": destination.secret },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
}
