import { randomBytes } from "node:crypto";
import { createAuthEndpoint, getSessionFromCtx, APIError } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { verifySignIn } from "@solana/wallet-standard-util";
import { PublicKey } from "@solana/web3.js";
import { canonicalAddress } from "./wallet-link.mjs";

// A wallet-only account's email: under .invalid (RFC 2606), so it can never
// receive mail, and the service token never reports it (service-token.mjs).
export const WALLET_EMAIL_DOMAIN = "wallet.seametry.invalid";

// Hex of the key bytes, not base58: emails are compared case-insensitively
// and base58 is case-sensitive.
export function walletEmail(address) {
  return `${Buffer.from(new PublicKey(address).toBytes()).toString("hex")}@${WALLET_EMAIL_DOMAIN}`;
}

// Wallet ownership in seametry_wallet_link (migrations/0001_wallet_links.sql).
// The address primary key makes claim first-writer-wins.
export function poolWallets(pool) {
  return {
    async ownerOf(address) {
      const result = await pool.query("SELECT account_id FROM seametry_wallet_link WHERE address = $1", [address]);
      return result.rows[0]?.account_id;
    },
    async claim(address, accountId) {
      const result = await pool.query(
        "INSERT INTO seametry_wallet_link (address, account_id) VALUES ($1, $2) ON CONFLICT (address) DO NOTHING RETURNING address",
        [address, accountId],
      );
      return result.rows.length === 1;
    },
  };
}

async function ensureWalletAccount(adapter, address, userId) {
  if (!(await adapter.findAccountByKey({ providerId: "solana", accountId: address }))) {
    await adapter.createAccount({ userId, providerId: "solana", accountId: address });
  }
}

const NONCE_PREFIX = "solana-sign-in:";
const NONCE_LIFETIME_MS = 5 * 60 * 1000;
const STATEMENT = "Sign in to Seametry. This does not approve a transaction.";

function refuse(status, code, message) {
  throw APIError.from(status, { code, message });
}

function bytes(encoded, length) {
  if (typeof encoded !== "string" || encoded.length > 8192 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return undefined;
  const decoded = new Uint8Array(Buffer.from(encoded, "base64"));
  if (length !== undefined && decoded.length !== length) return undefined;
  return decoded.length ? decoded : undefined;
}

// Sign in with Solana (the wallet-standard solana:signIn message). The server
// writes the whole message input, so the domain, URI, chain, nonce and expiry
// are ours; the wallet only signs it. A nonce is single use: it is consumed
// (atomically) before the signature is checked, so a failed attempt also spends it.
//
// Ownership of a wallet is seametry_wallet_link, the same table the link flow
// and the service token's wallets claim read (wallets.ownerOf / wallets.claim).
// Signed out, a wallet nobody owns gets a new wallet-only account. Signed in,
// the same signature links an unowned wallet to the open account and keeps
// its session; a wallet owned by another account is refused (409), never
// merged.
export function solanaSignIn({ trustedOrigins, wallets, chainId = "solana:mainnet", now = () => new Date() }) {
  const trusted = new Set(trustedOrigins);
  const originOf = (ctx) => {
    const origin = ctx.request?.headers.get("origin");
    if (!origin || !trusted.has(origin)) refuse("FORBIDDEN", "UNTRUSTED_ORIGIN", "Sign-in is not available from this origin.");
    return origin;
  };
  return {
    id: "solana-sign-in",
    rateLimit: [
      { pathMatcher: (path) => path === "/solana/nonce", window: 60, max: 10 },
      { pathMatcher: (path) => path === "/solana/verify", window: 60, max: 10 },
    ],
    endpoints: {
      solanaNonce: createAuthEndpoint("/solana/nonce", { method: "POST", requireRequest: true }, async (ctx) => {
        const origin = originOf(ctx);
        const issued = now();
        const nonce = randomBytes(24).toString("hex");
        const input = {
          domain: new URL(origin).host,
          statement: STATEMENT,
          uri: origin,
          version: "1",
          chainId,
          nonce,
          issuedAt: issued.toISOString(),
          expirationTime: new Date(issued.getTime() + NONCE_LIFETIME_MS).toISOString(),
        };
        await ctx.context.internalAdapter.createVerificationValue({
          identifier: `${NONCE_PREFIX}${nonce}`,
          value: JSON.stringify(input),
          expiresAt: new Date(input.expirationTime),
        });
        return ctx.json({ input });
      }),
      solanaVerify: createAuthEndpoint("/solana/verify", { method: "POST", requireRequest: true }, async (ctx) => {
        const origin = originOf(ctx);
        const nonce = ctx.body?.nonce;
        if (typeof nonce !== "string" || !/^[0-9a-f]{48}$/.test(nonce)) refuse("UNAUTHORIZED", "INVALID_NONCE", "Sign-in expired. Try again.");
        const stored = await ctx.context.internalAdapter.consumeVerificationValue(`${NONCE_PREFIX}${nonce}`);
        if (!stored) refuse("UNAUTHORIZED", "INVALID_NONCE", "Sign-in expired. Try again.");
        if (new Date(stored.expiresAt).getTime() <= now().getTime()) refuse("UNAUTHORIZED", "INVALID_NONCE", "Sign-in expired. Try again.");
        const input = JSON.parse(stored.value);
        if (input.uri !== origin) refuse("UNAUTHORIZED", "INVALID_SIGNATURE", "The wallet signature could not be verified.");

        const output = ctx.body?.output ?? {};
        const address = canonicalAddress(output.address);
        const publicKey = bytes(output.publicKey, 32);
        const signedMessage = bytes(output.signedMessage);
        const signature = bytes(output.signature, 64);
        const valid = address && publicKey && signedMessage && signature
          && new PublicKey(publicKey).toBase58() === address
          && verifySignIn({ ...input, address }, { account: { address, publicKey }, signedMessage, signature });
        if (!valid) refuse("UNAUTHORIZED", "INVALID_SIGNATURE", "The wallet signature could not be verified.");

        let owner = await wallets.ownerOf(address);
        const adapter = ctx.context.internalAdapter;
        const current = await getSessionFromCtx(ctx);
        if (current) {
          if (owner && owner !== current.user.id) refuse("CONFLICT", "WALLET_OWNED", "This wallet belongs to another account.");
          if (!owner && !(await wallets.claim(address, current.user.id))) refuse("CONFLICT", "WALLET_OWNED", "This wallet belongs to another account.");
          await ensureWalletAccount(adapter, address, current.user.id);
          return ctx.json({ linked: true, user: { id: current.user.id, walletAddress: address } });
        }

        let user = owner ? await adapter.findUserById(owner) : undefined;
        if (!user) {
          const created = await adapter.createUser({ name: address, email: walletEmail(address), emailVerified: false });
          if (await wallets.claim(address, created.id)) user = created;
          else {
            await adapter.deleteUser(created.id);
            owner = await wallets.ownerOf(address);
            user = owner ? await adapter.findUserById(owner) : undefined;
            if (!user) refuse("CONFLICT", "WALLET_OWNED", "This wallet belongs to another account.");
          }
        }
        await ensureWalletAccount(adapter, address, user.id);

        const session = await adapter.createSession(user.id);
        if (!session) refuse("INTERNAL_SERVER_ERROR", "SESSION_FAILED", "Sign-in failed. Try again.");
        await setSessionCookie(ctx, { session, user });
        return ctx.json({ user: { id: user.id, walletAddress: address } });
      }),
    },
  };
}
