import assert from "node:assert/strict";
import test from "node:test";
import { appOrigins } from "../src/app-origins.mjs";

test("production trusts only the deployed origins unless told otherwise", () => {
  assert.deepEqual(appOrigins({ NODE_ENV: "production" }), ["https://www.seametry.xyz", "https://seametry.xyz"]);
});

test("outside production the default also trusts the local web app", () => {
  assert.deepEqual(appOrigins({}), ["https://www.seametry.xyz", "https://seametry.xyz", "http://localhost:3000"]);
  assert.deepEqual(appOrigins({ NODE_ENV: "development" }), ["https://www.seametry.xyz", "https://seametry.xyz", "http://localhost:3000"]);
});

test("SEAMETRY_APP_ORIGINS replaces the default, localhost included only if it names it", () => {
  assert.deepEqual(appOrigins({ NODE_ENV: "production", SEAMETRY_APP_ORIGINS: " https://seametry.xyz , http://localhost:3000," }), ["https://seametry.xyz", "http://localhost:3000"]);
  assert.deepEqual(appOrigins({ NODE_ENV: "development", SEAMETRY_APP_ORIGINS: "https://seametry.xyz" }), ["https://seametry.xyz"]);
});
