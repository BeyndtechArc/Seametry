import type { ReactNode } from "react";
import { accountServiceConfigured } from "@/lib/auth-proxy";
import { SiteWalletProvider } from "@/lib/wallet-provider";
import { AppShell } from "./_shell/app-shell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SiteWalletProvider>
      <AppShell accountConfigured={accountServiceConfigured()}>{children}</AppShell>
    </SiteWalletProvider>
  );
}
