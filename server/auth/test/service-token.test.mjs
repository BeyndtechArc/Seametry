import assert from "node:assert/strict";
import test from "node:test";
import { serviceTokenPayload } from "../src/service-token.mjs";

test("service tokens add no profile fields beyond Better Auth's subject", () => {
  const payload = serviceTokenPayload({
    user: {
      id: "account-1",
      email: "holder@example.com",
      name: "Holder",
      image: "https://images.example/holder.png",
    },
  });

  assert.deepEqual(payload, {});
  assert.equal(JSON.stringify(payload).includes("holder@example.com"), false);
});
