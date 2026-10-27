import assert from "node:assert/strict";
import test from "node:test";
import { MAX_TOKEN_WALLETS, serviceTokenPayload } from "../src/service-token.mjs";

const session = {
  user: {
    id: "account-1",
    email: "holder@example.com",
    name: "Holder",
    image: "https://images.example/holder.png",
  },
};

test("service tokens carry the account's linked wallets and no profile field", async () => {
  const queries = [];
  const pool = {
    async query(text, values) {
      queries.push({ text, values });
      return { rows: [{ address: "FFyrQgpU4BQ2FLesy6t5MmPUDimPj2ghwChTMrLBN5DM" }] };
    },
  };
  const payload = await serviceTokenPayload(pool)(session);

  assert.deepEqual(payload, { wallets: ["FFyrQgpU4BQ2FLesy6t5MmPUDimPj2ghwChTMrLBN5DM"] });
  assert.equal(JSON.stringify(payload).includes("holder@example.com"), false);
  assert.deepEqual(queries[0].values, ["account-1", MAX_TOKEN_WALLETS]);
  assert.match(queries[0].text, /FROM seametry_wallet_link WHERE account_id = \$1/);
});

test("an account with no linked wallet gets an empty claim, not a missing one", async () => {
  const payload = await serviceTokenPayload({ async query() { return { rows: [] }; } })(session);
  assert.deepEqual(payload, { wallets: [] });
});
