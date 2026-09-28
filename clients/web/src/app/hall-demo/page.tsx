import { connection } from "next/server";
import { HallDemoWalletProvider } from "@/lib/hall/wallet-provider";
import { HallDemoFlow } from "./flow";
import "./hall-demo.css";

// await connection() forces dynamic rendering, which the CSP nonce in
// proxy.ts requires (see src/app/page.tsx for the fuller note); this route
// also reads no server data of its own, everything below is client-driven
// against devnet directly.
export default async function HallDemoPage() {
  await connection();
  return (
    <main className="hall-demo-page">
      <h1>The Hall, live on devnet</h1>
      <p className="lede">
        The melt always works. Delivery is each issuer&apos;s. Connect a wallet and watch it hold, against a real
        program, with a real issuer able to freeze one constituent mid-flow.
      </p>
      <HallDemoWalletProvider>
        <HallDemoFlow />
      </HallDemoWalletProvider>
    </main>
  );
}
