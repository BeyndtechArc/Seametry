import type { Metadata } from "next";
import { connection } from "next/server";
import { AlloyRegister } from "../alloy-workbench";

export const metadata: Metadata = {
  title: "Hall register | Seametry Terminal",
  description: "Live Alloy accounts read from the deployed Hall.",
};

export default async function AlloysPage() {
  await connection();
  return <AlloyRegister />;
}
