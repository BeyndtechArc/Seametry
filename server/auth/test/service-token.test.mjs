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

test("service tokens carry the account's linked wallets and verified email, and no other profile field", async () => {
  const queries = [];
  const pool = {
    async query(text, values) {
      queries.push({ text, values });
      return { rows: [{ address: "FFyrQgpU4BQ2FLesy6t5MmPUDimPj2ghwChTMrLBN5DM" }] };
    },
  };
  const payload = await serviceTokenPayload(pool)(session);

  assert.deepEqual(payload, {
    wallets: ["FFyrQgpU4BQ2FLesy6t5MmPUDimPj2ghwChTMrLBN5DM"],
    email: "holder@example.com",
    email_verified: true,
  });
  assert.equal(JSON.stringify(payload).includes("Holder\""), false);
  assert.equal(JSON.stringify(payload).includes("images.example"), false);
  assert.deepEqual(queries[0].values, ["account-1", MAX_TOKEN_WALLETS]);
  assert.match(queries[0].text, /FROM seametry_wallet_link WHERE account_id = \$1/);
});

test("an account with no linked wallet gets an empty claim, not a missing one", async () => {
  const payload = await serviceTokenPayload({ async query() { return { rows: [] }; } })(session);
  assert.deepEqual(payload, { wallets: [], email: "holder@example.com", email_verified: true });
});

test("an email the provider did not verify, or a malformed flag, is carried as unverified", async () => {
  const none = { async query() { return { rows: [] }; } };
  for (const emailVerified of [false, undefined, "true", 1]) {
    const payload = await serviceTokenPayload(none)({ user: { ...session.user, emailVerified } });
    assert.equal(payload.email_verified, false, `emailVerified ${JSON.stringify(emailVerified)}`);
  }
});
