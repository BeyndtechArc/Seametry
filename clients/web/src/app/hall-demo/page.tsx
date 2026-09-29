import type { Metadata } from "next";
import { connection } from "next/server";
import { RouteAction, TextAction } from "@seametry/ui";
import { HallDemoWalletProvider } from "@/lib/hall/wallet-provider";
import { PublicShell } from "../public-shell";
import { HallDemoFlow } from "./flow";
import "./hall-demo.css";

export const metadata: Metadata = {
  title: "Hall demonstration | Seametry",
  description: "Use a devnet wallet to Strike, freeze, Melt and withdraw against the deployed Hall program.",
};

export default async function HallDemoPage() {
  await connection();
  return (
    <PublicShell current="hall">
      <div className="hall-demo-page">
        <h1>The Hall, live on devnet</h1>
        <p className="lede">
          The melt always works. Delivery is each issuer&apos;s. Connect a wallet and watch it hold, against a real
          program, with a real issuer able to freeze one constituent mid-flow.
        </p>
        <div className="hall-demo-route">
          <RouteAction href="/terminal/alloys">Inspect live Alloys</RouteAction>
          <TextAction href="/how-it-works">Read the Hall mechanism</TextAction>
        </div>
        <HallDemoWalletProvider>
          <HallDemoFlow />
        </HallDemoWalletProvider>
      </div>
    </PublicShell>
  );
}
