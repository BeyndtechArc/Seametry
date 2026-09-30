import type { Metadata } from "next";
import { connection } from "next/server";
import { InstrumentAssay } from "../../_desk/workbench";

export const metadata: Metadata = {
  title: "Instrument assay | Seametry",
  description: "One recorded instrument with its policy decision, buy depth and issuer powers.",
};

export default async function InstrumentPage({ params }: { params: Promise<{ mint: string }> }) {
  await connection();
  const { mint } = await params;
  return <InstrumentAssay mint={mint} />;
}
