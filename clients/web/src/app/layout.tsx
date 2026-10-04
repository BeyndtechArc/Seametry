import type { Metadata } from "next";
import "@seametry/ui/tokens.css";
import "./globals.css";
import { SiteWalletProvider } from "@/lib/wallet-provider";
import { sentient, switzer, fragmentMono } from "./fonts";

// A shared link previews with the meta flyer. Crawlers need an absolute URL,
// hence metadataBase; the flyer's 1.90:1 frame is the preview ratio already.
const flyer = {
  url: "/Seametry%20meta%20flyer.png",
  width: 3720,
  height: 1956,
  alt: "Seametry. Open-AP ETFs on Solana: baskets that keep working when issuers freeze.",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://www.seametry.xyz"),
  title: "Seametry",
  description: "Know what it's made of.",
  openGraph: { type: "website", siteName: "Seametry", title: "Seametry", description: "Open-AP ETFs on Solana: baskets that keep working when issuers freeze.", images: [flyer] },
  twitter: { card: "summary_large_image", title: "Seametry", description: "Open-AP ETFs on Solana: baskets that keep working when issuers freeze.", images: [flyer] },
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
