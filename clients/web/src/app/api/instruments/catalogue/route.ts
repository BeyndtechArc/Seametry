import { NextRequest, NextResponse } from "next/server";
import { cataloguePage } from "@/lib/instrument-catalogue";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const issuer = request.nextUrl.searchParams.get("issuer") ?? "any";
  const pageText = request.nextUrl.searchParams.get("page") ?? "1";
  const page = /^\d+$/.test(pageText) ? Number(pageText) : 1;
  return NextResponse.json(cataloguePage({ query, issuer, page }));
}
