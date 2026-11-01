import assert from "node:assert/strict";
import test from "node:test";
import { MAX_TOKEN_WALLETS, serviceTokenPayload } from "../src/service-token.mjs";

const session = {
  user: {
    id: "account-1",
    email: "holder@example.com",
    name: "Holder",
    image: "https://images.example/holder.png",
    emailVerified: true,
  },
};

function accountPool({ wallets = [], providers = [] } = {}) {
  const queries = [];
  return {
    queries,
    async query(text, values) {
      queries.push({ text, values });
      if (text.startsWith("SELECT address FROM seametry_wallet_link")) return { rows: wallets.map((address) => ({ address })) };
      if (text.startsWith('SELECT DISTINCT "providerId" AS provider FROM account WHERE "userId" = $1')) return { rows: providers.map((provider) => ({ provider })) };
      throw new Error(`Unexpected SQL: ${text}`);
    },
  };
}

test("service tokens carry the account's linked wallets and verified email, and no other profile field", async () => {
  const pool = accountPool({ wallets: ["FFyrQgpU4BQ2FLesy6t5MmPUDimPj2ghwChTMrLBN5DM"], providers: ["google"] });
  const { queries } = pool;
  const payload = await serviceTokenPayload(pool)(session);

  assert.deepEqual(payload, {
    wallets: ["FFyrQgpU4BQ2FLesy6t5MmPUDimPj2ghwChTMrLBN5DM"],
    email: "holder@example.com",
    email_verified: true,
    auth_methods: ["google"],
    kyc_level: "none",
  });
  assert.equal(JSON.stringify(payload).includes("Holder\""), false);
  assert.equal(JSON.stringify(payload).includes("images.example"), false);
  assert.deepEqual(queries[0].values, ["account-1", MAX_TOKEN_WALLETS]);
  assert.match(queries[0].text, /FROM seametry_wallet_link WHERE account_id = \$1/);
});

test("an account with no linked wallet gets an empty claim, not a missing one", async () => {
  const payload = await serviceTokenPayload(accountPool())(session);
  assert.deepEqual(payload, { wallets: [], email: "holder@example.com", email_verified: true, auth_methods: [], kyc_level: "none" });
});

test("an email the provider did not verify, or a malformed flag, is carried as unverified", async () => {
  const none = accountPool();
  for (const emailVerified of [false, undefined, "true", 1]) {
    const payload = await serviceTokenPayload(none)({ user: { ...session.user, emailVerified } });
    assert.equal(payload.email_verified, false, `emailVerified ${JSON.stringify(emailVerified)}`);
  }
});

test("the sign-in methods are the account's providers by name, and KYC is none until it exists", async () => {
  const payload = await serviceTokenPayload(accountPool({ providers: ["solana", "google", "credential", "github"] }))(session);
  assert.deepEqual(payload.auth_methods, ["solana", "google", "email"]);
  assert.equal(payload.kyc_level, "none");
  const queries = accountPool().queries;
  assert.deepEqual(queries, []);
});
