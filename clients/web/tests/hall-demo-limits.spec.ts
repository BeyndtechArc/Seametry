import { expect, test } from "@playwright/test";
import {
  FOUNDINGS_PER_WINDOW,
  FOUNDING_WINDOW_MS,
  FoundingThrottle,
  HOLDER_FEE_ALLOWANCE_LAMPORTS,
  HOLDER_SIGNED_TRANSACTIONS,
  clientAddress,
  holderTopUp,
} from "../src/lib/hall/limits";

const claimRent = 4_000_000n;
const target = claimRent + HOLDER_SIGNED_TRANSACTIONS * HOLDER_FEE_ALLOWANCE_LAMPORTS;

test("an empty wallet is topped up to exactly the claim rent plus the fee allowance", () => {
  expect(holderTopUp(0n, claimRent)).toBe(target);
});

test("a partly funded wallet receives only the shortfall", () => {
  expect(holderTopUp(target - 1n, claimRent)).toBe(1n);
});

test("a wallet already holding the target receives nothing", () => {
  expect(holderTopUp(target, claimRent)).toBe(0n);
  expect(holderTopUp(target + 1n, claimRent)).toBe(0n);
});

test("one address founds up to the limit, then waits out the rest of its window", () => {
  const throttle = new FoundingThrottle();
  for (let i = 0; i < FOUNDINGS_PER_WINDOW; i += 1) {
    expect(throttle.retryAfter("203.0.113.7", 1_000 + i)).toBe(0);
  }
  expect(throttle.retryAfter("203.0.113.7", 1_000 + FOUNDINGS_PER_WINDOW)).toBe(FOUNDING_WINDOW_MS - FOUNDINGS_PER_WINDOW);
});

test("a refused address does not hold back a different one", () => {
  const throttle = new FoundingThrottle(1, FOUNDING_WINDOW_MS);
  expect(throttle.retryAfter("203.0.113.7", 0)).toBe(0);
  expect(throttle.retryAfter("203.0.113.7", 1)).toBeGreaterThan(0);
  expect(throttle.retryAfter("198.51.100.2", 1)).toBe(0);
});

test("a new window opens once the old one has elapsed", () => {
  const throttle = new FoundingThrottle(1, FOUNDING_WINDOW_MS);
  expect(throttle.retryAfter("203.0.113.7", 0)).toBe(0);
  expect(throttle.retryAfter("203.0.113.7", FOUNDING_WINDOW_MS - 1)).toBe(1);
  expect(throttle.retryAfter("203.0.113.7", FOUNDING_WINDOW_MS)).toBe(0);
  expect(throttle.retryAfter("203.0.113.7", FOUNDING_WINDOW_MS + 1)).toBe(FOUNDING_WINDOW_MS - 1);
});

test("the client is the first x-forwarded-for entry, and a missing header shares one bucket", () => {
  expect(clientAddress("203.0.113.7, 10.0.0.1")).toBe("203.0.113.7");
  expect(clientAddress(" 203.0.113.7 ")).toBe("203.0.113.7");
  expect(clientAddress(null)).toBe("unknown");
  expect(clientAddress("")).toBe("unknown");
});
