// Read from EXPO_PUBLIC_* at build time, so a development build can point at a
// local web app; nothing secret belongs here, since the bundle ships it.

/** The web app that prepares, approves and submits every leg; the app holds no key and no secret. */
export const ORIGIN = process.env.EXPO_PUBLIC_SEAMETRY_ORIGIN ?? "https://www.seametry.xyz";

/**
 * Phantom Connect's App ID, from Phantom Portal. Only Storm can register one;
 * without it the app can build a plan but cannot sign, and says so.
 */
export const PHANTOM_APP_ID = process.env.EXPO_PUBLIC_PHANTOM_APP_ID;

export const SCHEME = "seametry";
