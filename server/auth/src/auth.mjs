import { dash } from "@better-auth/infra";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import pg from "pg";

const { Pool } = pg;

const required = [
  "AUTH_DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_API_KEY",
  "BETTER_AUTH_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
];

for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required by the auth service.`);
}

export const pool = new Pool({ connectionString: process.env.AUTH_DATABASE_URL });

export const trustedOrigins = (process.env.SEAMETRY_APP_ORIGINS ?? "https://www.seametry.xyz,https://seametry.xyz,http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const auth = betterAuth({
  appName: "Seametry",
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins,
  emailAndPassword: { enabled: false },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
  },
  account: { accountLinking: { disableImplicitLinking: true } },
  user: { deleteUser: { enabled: true } },
  session: { cookieCache: { enabled: true, maxAge: 5 * 60 } },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 30,
    customRules: { "/sign-in/social": { window: 60, max: 5 } },
  },
  plugins: [dash({ apiKey: process.env.BETTER_AUTH_API_KEY }), jwt()],
});
