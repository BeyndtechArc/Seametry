import { createServer } from "node:http";
import { auth, pool, trustedOrigins } from "./auth.mjs";
import { isBetterAuthPath, isHealthPath } from "./routes.mjs";
import { accountJson, createAccountRoutes } from "./account-routes.mjs";

const port = Number(process.env.PORT ?? 3005);
const accountRoute = createAccountRoutes({
  pool,
  trustedOrigins,
  getSession: (request) => auth.api.getSession({ headers: request.headers }),
});

async function readBody(request) {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_048_576) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function toWebRequest(request) {
  const url = new URL(request.url ?? "/", process.env.BETTER_AUTH_URL);
  const body = await readBody(request);
  return new Request(url, { method: request.method, headers: request.headers, body });
}

async function write(response, target) {
  target.statusCode = response.status;
  for (const [name, value] of response.headers) {
    if (name !== "set-cookie") target.setHeader(name, value);
  }
  if (typeof response.headers.getSetCookie === "function") {
    const cookies = response.headers.getSetCookie();
    if (cookies.length) target.setHeader("set-cookie", cookies);
  } else if (response.headers.get("set-cookie")) {
    target.setHeader("set-cookie", response.headers.get("set-cookie"));
  }
  target.end(Buffer.from(await response.arrayBuffer()));
}

const server = createServer(async (incoming, outgoing) => {
  try {
    const request = await toWebRequest(incoming);
    const path = new URL(request.url).pathname;
    let response;
    if (isHealthPath(path)) response = accountJson({ status: "ok" });
    else if (isBetterAuthPath(path)) response = await auth.handler(request);
    else response = await accountRoute(path, request);
    await write(response, outgoing);
  } catch (error) {
    console.error(error);
    await write(accountJson({ error: "Account service failed." }, 500), outgoing);
  }
});

server.listen(port, "0.0.0.0", () => console.log(`Seametry auth listening on ${port}`));

async function shutdown() {
  server.close();
  await pool.end();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
