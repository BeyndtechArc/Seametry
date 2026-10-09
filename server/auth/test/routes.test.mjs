import assert from "node:assert/strict";
import test from "node:test";
import { isBetterAuthPath } from "../src/routes.mjs";

test("the Better Auth base path and its endpoints reach the auth handler", () => {
  assert.equal(isBetterAuthPath("/api/auth"), true);
  assert.equal(isBetterAuthPath("/api/auth/dash/config"), true);
  assert.equal(isBetterAuthPath("/api/account/wallets"), false);
  assert.equal(isBetterAuthPath("/api/authentication"), false);
});
