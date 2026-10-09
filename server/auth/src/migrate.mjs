import { readFile } from "node:fs/promises";
import { getMigrations } from "better-auth/db/migration";
import { auth, pool } from "./auth.mjs";

const { runMigrations } = await getMigrations(auth.options);
await runMigrations();

const walletMigration = await readFile(new URL("../migrations/0001_wallet_links.sql", import.meta.url), "utf8");
await pool.query(walletMigration);
await pool.end();
console.log("Better Auth and Seametry account migrations are current.");
