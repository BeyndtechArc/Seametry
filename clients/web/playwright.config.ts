import { defineConfig } from "@playwright/test";

// A real browser, not an assumption: docs/prd/EXPLORER.md section 8 requires
// the Content-Security-Policy in next.config.ts to hold, and Next's own docs
// do not say whether experimental.sri alone satisfies script-src 'self' for
// the inline hydration script every App Router page emits. This starts the
// production build and checks every route against the real policy.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3847",
  },
  webServer: {
    command: "npm run build && npm run start -- -p 3847",
    url: "http://localhost:3847",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
