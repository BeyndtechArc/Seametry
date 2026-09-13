import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = { title: "Seametry — Market state before execution", description: "Independent market-state preflight for tokenized equities on Solana." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
