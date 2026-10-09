export function isBetterAuthPath(path) {
  return path === "/api/auth" || path.startsWith("/api/auth/");
}

export function isHealthPath(path) {
  return path === "/healthz" || path === "/api/auth/ok";
}
