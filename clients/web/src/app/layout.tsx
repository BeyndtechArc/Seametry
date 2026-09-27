import type { Metadata } from "next";
import "@seametry/ui/tokens.css";
import "./globals.css";
import { sentient, switzer, fragmentMono } from "./fonts";

export const metadata: Metadata = {
  title: "Seametry",
  description: "Know what it's made of.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sentient.variable} ${switzer.variable} ${fragmentMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
