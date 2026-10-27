const deployedOrigins = ["https://www.seametry.xyz", "https://seametry.xyz"];
const developmentOrigin = "http://localhost:3000";

// Trusted origins pass Better Auth's origin check and the wallet-link origin
// gate. In production, a page on a user's own localhost:3000 is not Seametry,
// so it is trusted only where SEAMETRY_APP_ORIGINS names it. Outside
// production it stays in the default so `next dev` can sign in.
export function appOrigins(env) {
  if (env.SEAMETRY_APP_ORIGINS !== undefined) {
    return env.SEAMETRY_APP_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean);
  }
  return env.NODE_ENV === "production" ? deployedOrigins : [...deployedOrigins, developmentOrigin];
}
