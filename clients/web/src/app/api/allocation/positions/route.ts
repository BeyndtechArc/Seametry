import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";
import { admissions } from "@/lib/allocation/admissions";
import { listedPositions, type TokenHolding } from "@/lib/allocation/positions";
import { balanceEndpoint } from "@/lib/wallet/balances";

export async function GET(request: NextRequest) {
  const walletText = request.nextUrl.searchParams.get("wallet");
  let wallet: PublicKey;
  try {
    if (!walletText) throw new Error("missing");
    wallet = new PublicKey(walletText);
  } catch {
    return NextResponse.json({ error: "Supply a Solana wallet address in ?wallet=." }, { status: 400 });
  }
  const configured = balanceEndpoint("mainnet");
  if ("missing" in configured) return NextResponse.json({ error: "Mainnet wallet holdings are unavailable: MAINNET_RPC_URL is not set." }, { status: 503 });

  try {
    const connection = new Connection(configured.endpoint, "confirmed");
    const accounts = await Promise.all([TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID].map((programId) => connection.getParsedTokenAccountsByOwner(wallet, { programId }, "confirmed")));
    const holdings: TokenHolding[] = accounts.flatMap((response, index) => response.value.flatMap(({ account, pubkey }) => {
      const parsed = account.data;
      if (!("parsed" in parsed) || parsed.parsed?.type !== "account") return [];
      const info = parsed.parsed.info as { mint?: string; tokenAmount?: { amount?: string; decimals?: number } };
      if (!info.mint || !info.tokenAmount?.amount || info.tokenAmount.decimals === undefined) return [];
      return [{ mint: info.mint, atoms: info.tokenAmount.amount, decimals: info.tokenAmount.decimals, tokenProgram: [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID][index].toBase58(), account: pubkey.toBase58() }];
    }));
    const associated = new Map(admissions.instruments.map((lot) => [lot.instrument.mint, getAssociatedTokenAddressSync(new PublicKey(lot.instrument.mint), wallet, false, new PublicKey(lot.token_program)).toBase58()]));
    const positions = listedPositions(holdings, admissions.instruments, associated);
    return NextResponse.json({ wallet: wallet.toBase58(), network: "mainnet", source: "Solana mainnet RPC", observedAt: new Date().toISOString(), positions, outsideRegister: holdings.filter((holding) => BigInt(holding.atoms) > 0n && !admissions.instruments.some((lot) => lot.instrument.mint === holding.mint)).length });
  } catch (error) {
    return NextResponse.json({ error: `Mainnet wallet holdings could not be read: ${error instanceof Error ? error.message : String(error)}. Try again before selling.` }, { status: 502 });
  }
}
