import type { Metadata } from "next";
import { connection } from "next/server";
import { TextAction } from "@seametry/ui";
import { HallDemoWalletProvider } from "@/lib/hall/wallet-provider";
import { PageHeader } from "../_shell/page-header";
import { HallDemoFlow } from "./flow";
import "./hall-demo.css";

export const metadata: Metadata = {
  title: "Hall demo | Seametry",
  description: "Use a devnet wallet to Strike, freeze, Melt and withdraw against the deployed Hall program.",
};

export default async function HallDemoPage() {
  await connection();
  return (
    <div className="hall-demo-page">
      <PageHeader
        group="Hall"
        title="Demo"
        network="Devnet"
        info={<p>Strike, watch the issuer freeze one constituent, Melt anyway, and withdraw each leg, signed by your own wallet.</p>}
      >
        <TextAction href="/app/alloys">Inspect live Alloys</TextAction>
        <TextAction href="/how-it-works">Read the Hall mechanism</TextAction>
      </PageHeader>
      <HallDemoWalletProvider>
        <HallDemoFlow />
      </HallDemoWalletProvider>
    </div>
  );
}
