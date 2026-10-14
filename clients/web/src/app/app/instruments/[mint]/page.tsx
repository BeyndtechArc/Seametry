import type { Metadata } from "next";
import { connection } from "next/server";
import { findAdmission, gradeOf, isAdmitted } from "@/lib/allocation/admissions";
import { findCatalogueInstrument } from "@/lib/instrument-catalogue";
import { identityOf } from "@/lib/instrument-identity";
import { InstrumentAssay } from "../../_desk/workbench";

export const metadata: Metadata = {
  title: "Instrument assay | Seametry",
  description: "One recorded instrument with its policy decision, buy depth and issuer powers.",
};

export default async function InstrumentPage({ params, searchParams }: { params: Promise<{ mint: string }>; searchParams: Promise<{ from?: string; selected?: string }> }) {
  await connection();
  const { mint } = await params;
  const { from, selected } = await searchParams;
  const admission = findAdmission(mint);
  const listing = findCatalogueInstrument(mint);
  const identity = identityOf(mint);
  return <InstrumentAssay mint={mint} identity={{ name: identity?.name, logo: identity?.logo }} listing={listing} admission={admission} grade={admission ? gradeOf(admission) : undefined} canAdd={Boolean(admission && isAdmitted(admission))} from={from === "compose" || from === "allocation" ? from : undefined} selected={selected ?? ""} />;
}
