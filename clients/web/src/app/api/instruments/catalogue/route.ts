import { NextRequest, NextResponse } from "next/server";
import { cataloguePage } from "@/lib/instrument-catalogue";
import { CATALOGUE_STATES, type CatalogueState } from "@/lib/instrument-catalogue-contract";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const issuer = request.nextUrl.searchParams.get("issuer") ?? "any";
  const stateText = request.nextUrl.searchParams.get("state") ?? "any";
  if (stateText !== "any" && !CATALOGUE_STATES.includes(stateText as CatalogueState)) {
    return NextResponse.json({ title: "Unknown state", detail: `Expected ?state= one of any, ${CATALOGUE_STATES.join(", ")}; received ${JSON.stringify(stateText)}.`, status: 400 }, { status: 400 });
  }
  const pageText = request.nextUrl.searchParams.get("page") ?? "1";
  const page = /^\d+$/.test(pageText) ? Number(pageText) : 1;
  return NextResponse.json(cataloguePage({ query, issuer, state: stateText as CatalogueState | "any", page }));
}
