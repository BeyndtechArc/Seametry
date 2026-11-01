import { readFile } from "node:fs/promises";
import { getMigrations } from "better-auth/db/migration";
import { auth, pool } from "./auth.mjs";

const { runMigrations } = await getMigrations(auth.options);
await runMigrations();

for (const name of ["0001_wallet_links.sql", "0002_drop_wallet_challenge.sql"]) {
  await pool.query(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
}
await pool.end();
console.log("Better Auth and Seametry account migrations are current.");
