import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { SIGNING_WINDOW_MS } from "./rules";

// ENGINEERING_STANDARD.md section 11: "Approval binds an immutable digest over
// instrument version, market state snapshot, quote, policy version, wallet,
// and message. Any material change invalidates the approval." The route
// handlers are stateless, so the approval travels with the prepared leg as a
// token this server signed, and submission accepts only a transaction whose
// message is byte for byte the one approved.

export type ApprovalTerms = {
  direction: "buy" | "sell";
  wallet: string;
  mint: string;
  /** The admission decision's input digest: which evidence the instrument was judged on. */
  inputDigest: string;
  policyVersion: string;
  inAtoms: string;
  outAtoms: string;
  floorAtoms: string;
  /** SHA-256 of the unsigned transaction message the holder is asked to sign. */
  messageSha256: string;
  expiresAt: string;
};

// A fixed field order, so the same terms always produce the same bytes.
function canonical(terms: ApprovalTerms): string {
  return JSON.stringify([
    terms.direction,
    terms.wallet,
    terms.mint,
    terms.inputDigest,
    terms.policyVersion,
    terms.inAtoms,
    terms.outAtoms,
    terms.floorAtoms,
    terms.messageSha256,
    terms.expiresAt,
  ]);
}

export function messageDigest(message: Uint8Array): string {
  return createHash("sha256").update(message).digest("hex");
}

function mac(secret: string, body: string): Buffer {
  return createHmac("sha256", secret).update(body).digest();
}

export function signApproval(terms: ApprovalTerms, secret: string): string {
  const body = canonical(terms);
  return `${Buffer.from(body).toString("base64url")}.${mac(secret, body).toString("base64url")}`;
}

/**
 * A signed leg that arrived after its window, in words the holder can act
 * on. The window is the blockhash's, so the only remedy is a fresh quote
 * approved sooner; "refresh" alone did not say the approval was the late part.
 */
export function signedTooLate(direction: "buy" | "sell", lateMs: number): string {
  const late = Math.ceil(lateMs / 1_000);
  const window = SIGNING_WINDOW_MS / 1_000;
  return `Your approval reached Seametry ${late} ${late === 1 ? "second" : "seconds"} after this quote's ${window}-second signing window closed, so it was not sent. ${direction === "buy" ? "Buy again" : "Sell again"} for a fresh quote, then approve in your wallet without waiting.`;
}

export type OpenedApproval = { terms: ApprovalTerms } | { refused: string };

/**
 * The terms an approval token carries, if this server signed it and it has
 * not expired at `now`. Anything else is refused with the reason.
 */
export function openApproval(token: string, secret: string, now: Date): OpenedApproval {
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra !== undefined) {
    return { refused: "The approval is not in the form this server issues. Prepare the leg again." };
  }
  const body = Buffer.from(encoded, "base64url").toString();
  const expected = mac(secret, body);
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { refused: "The approval was not issued by this server, or was changed after it was. Prepare the leg again." };
  }
  const [direction, wallet, mint, inputDigest, policyVersion, inAtoms, outAtoms, floorAtoms, messageSha256, expiresAt] = JSON.parse(body) as string[];
  if (direction !== "buy" && direction !== "sell") return { refused: "The approval has no recognized trade direction. Prepare the leg again." };
  const terms: ApprovalTerms = { direction, wallet, mint, inputDigest, policyVersion, inAtoms, outAtoms, floorAtoms, messageSha256, expiresAt };
  const late = now.getTime() - Date.parse(expiresAt);
  if (late > 0) return { refused: signedTooLate(direction, late) };
  return { terms };
}
