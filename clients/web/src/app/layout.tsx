import type { Metadata } from "next";
import "@seametry/ui/tokens.css";
import "./globals.css";
import { SiteWalletProvider } from "@/lib/wallet-provider";
import { sentient, switzer, fragmentMono } from "./fonts";

export const metadata: Metadata = {
  title: "Seametry",
  description: "Know what it's made of.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // Rendered light on the server so the first paint is already the
      // default mode (ThemeControl in @seametry/ui); a stored dark choice is
      // applied on mount.
      data-theme="light"
      className={`${sentient.variable} ${switzer.variable} ${fragmentMono.variable}`}
    >
      <body>
        <SiteWalletProvider>{children}</SiteWalletProvider>
      </body>
    </html>
  );
}
