import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const app = new Hono();
app.get("/health", (context) => context.json({ status: "ok", service: "seametry-api" }));
app.get("/v1/coverage", async (context) => {
  for (const path of [resolve(process.cwd(), "evidence/coverage-latest.json"), resolve(process.cwd(), "../../evidence/coverage-latest.json")]) {
    try { return context.json(JSON.parse(await readFile(path, "utf8"))); }
    catch { /* Try the workspace-relative location next. */ }
  }
  return context.json({ error: "coverage-unavailable", next: "Run npm run coverage" }, 503);
});
serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 8787) });
