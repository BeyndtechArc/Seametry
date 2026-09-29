import type { Metadata } from "next";
import { connection } from "next/server";
import { InstrumentRegister } from "./workbench";

export const metadata: Metadata = {
  title: "Instrument desk | Seametry Terminal",
  description: "Recorded instrument, admissibility and depth evidence for Formula work.",
};

export default async function TerminalPage() {
  await connection();
  return <InstrumentRegister />;
}
