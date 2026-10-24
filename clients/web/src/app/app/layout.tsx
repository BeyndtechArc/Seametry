import type { ReactNode } from "react";
import { SiteWalletProvider } from "@/lib/wallet-provider";
import { AppShell } from "./_shell/app-shell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SiteWalletProvider>
      <AppShell>{children}</AppShell>
    </SiteWalletProvider>
  );
}
