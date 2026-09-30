import type { Metadata } from "next";
import { connection } from "next/server";
import { InstrumentRegister } from "../_desk/workbench";

export const metadata: Metadata = {
  title: "Instruments | Seametry",
  description: "Recorded instrument, admissibility and depth evidence for Formula work.",
};

export default async function TerminalPage() {
  await connection();
  return <InstrumentRegister />;
}
