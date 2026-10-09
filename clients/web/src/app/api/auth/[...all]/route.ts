import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

export const runtime = "nodejs";

const auth = getAuth();
const unavailable = () => Response.json({ error: "Account sign-in is not configured." }, { status: 503 });

export const { GET, POST } = auth
  ? toNextJsHandler(auth)
  : { GET: unavailable, POST: unavailable };
