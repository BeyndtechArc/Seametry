import { getAuth } from "@/lib/auth";

export const runtime = "nodejs";

function handle(request: Request) {
  const auth = getAuth();
  if (!auth) return Response.json({ error: "Account sign-in is not configured." }, { status: 503 });
  return auth.handler(request);
}

export const GET = handle;
export const POST = handle;
