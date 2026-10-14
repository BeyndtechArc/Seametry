import { defineConfig } from "@playwright/test";

// Sender's construction and transport rules need no app server or browser.
// Keep them runnable without loading local deployment credentials.
export default defineConfig({
  testDir: "./tests",
  testMatch: "sender.spec.ts",
  fullyParallel: true,
  reporter: "list",
});
