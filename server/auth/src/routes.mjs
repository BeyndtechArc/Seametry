export function isBetterAuthPath(path) {
  return path === "/api/auth" || path.startsWith("/api/auth/");
}
