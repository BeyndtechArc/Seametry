import type { Metadata } from "next";
import { connection } from "next/server";
import { findAdmission, gradeOf } from "@/lib/allocation/admissions";
import { InstrumentAssay } from "../../_desk/workbench";

export const metadata: Metadata = {
  title: "Instrument assay | Seametry",
  description: "One recorded instrument with its policy decision, buy depth and issuer powers.",
};

export default async function InstrumentPage({ params }: { params: Promise<{ mint: string }> }) {
  await connection();
  const { mint } = await params;
  const admission = findAdmission(mint);
  return <InstrumentAssay mint={mint} admission={admission} grade={admission ? gradeOf(admission) : undefined} />;
}
