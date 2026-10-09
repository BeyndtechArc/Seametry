import { proxyAccountRequest } from "@/lib/auth-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = proxyAccountRequest;
