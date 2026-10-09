import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { jwt } from "better-auth/plugins";
import { Pool } from "pg";

let pool: Pool | undefined;

export function authConfigured() {
  return Boolean(
    process.env.AUTH_DATABASE_URL &&
    process.env.BETTER_AUTH_SECRET &&
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET,
  );
}

export function authPool() {
  if (!authConfigured()) return undefined;
  pool ??= new Pool({ connectionString: process.env.AUTH_DATABASE_URL });
  return pool;
}

function createAuth() {
  return betterAuth({
    database: authPool()!,
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      },
    },
    account: { accountLinking: { disableImplicitLinking: true } },
    user: { deleteUser: { enabled: true } },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 30,
      customRules: { "/sign-in/social": { window: 60, max: 5 } },
    },
    plugins: [jwt(), nextCookies()],
  });
}

let instance: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  if (!authConfigured()) return undefined;
  instance ??= createAuth();
  return instance;
}
