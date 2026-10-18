// Funnel steps only the browser sees, sent to /api/activity/funnel without
// waiting and without a cookie. A step that fails to send is lost, never
// retried into the holder's way.

export type FunnelKind =
  | "wallet_connected"
  | "review_opened"
  | "signature_requested"
  | "signature_declined"
  | "signature_failed"
  | "sheet_abandoned";

export function funnel(kind: FunnelKind, detail: { wallet?: string; quoteId?: string } = {}) {
  const body = JSON.stringify({ events: [{ kind, ...detail }] });
  try {
    if (navigator.sendBeacon?.("/api/activity/funnel", new Blob([body], { type: "application/json" }))) return;
  } catch {
    // Some browsers refuse a beacon; fetch with keepalive is the same promise.
  }
  void fetch("/api/activity/funnel", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
}
