import type { Metadata } from "next";
import { connection } from "next/server";
import { AlloyRecord } from "../../_desk/alloy-workbench";

export const metadata: Metadata = {
  title: "Alloy record | Seametry",
  description: "Live Hall ledger and stated Strike and Melt terms for one Alloy.",
};

export default async function AlloyPage({ params }: { params: Promise<{ address: string }> }) {
  await connection();
  const { address } = await params;
  return <AlloyRecord address={address} />;
}
