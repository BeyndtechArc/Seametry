/**
 * Writes a founded Alloy's record to shared/evidence/alloys/<slug>/founding.json
 * from devnet itself, so the record is generated, never typed. It reads the
 * founding transaction, the Alloy account, the share mint's metadata and
 * each stand-in's metadata, and matches every stand-in to the captured
 * mainnet xStock it stands in for.
 *
 * The match is by symbol, and is stated as such in the record: a stand-in
 * carries no pointer to its real mint, only the symbol the founding route
 * wrote into its metadata from shared/evidence/admissions.json. Among the
 * captured instruments every symbol is unique, which the script checks.
 *
 * Run (from clients/web):
 *   npx tsx scripts/record-founding.ts <founding signature> <alloy address>
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID, getTokenMetadata } from "@solana/spl-token";
import admissions from "../../../shared/evidence/admissions.json";
import { ONE_SHARE_ATOMS, REGISTER_HALL_PROGRAM_ID } from "../src/lib/hall/constants";
import { hallProgram } from "../src/lib/hall/program";
import { KeypairWallet } from "../src/lib/hall/keypair-wallet";
import { alloySlug } from "../src/lib/compose/identity";

type LegRecord = { mint: PublicKey; ledger: { toString(): string } };
type AlloyAccount = { sponsor: PublicKey; shareMint: PublicKey; id: { toString(): string }; supply: { toString(): string }; lockedGenesis: { toString(): string }; constituentCount: number; legs: LegRecord[] };

async function main() {
  const [signature, address] = process.argv.slice(2);
  if (!signature || !address) throw new Error("Usage: npx tsx scripts/record-founding.ts <founding signature> <alloy address>");
  const endpoint = "https://api.devnet.solana.com";
  const connection = new Connection(endpoint, "finalized");

  const transaction = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: "finalized" });
  if (!transaction) throw new Error(`Transaction ${signature} is not finalized on devnet.`);
  if (transaction.meta?.err) throw new Error(`Transaction ${signature} failed on devnet: ${JSON.stringify(transaction.meta.err)}`);

  const program = hallProgram(new AnchorProvider(connection, new KeypairWallet(Keypair.generate()), {}), REGISTER_HALL_PROGRAM_ID);
  const alloy = (await (program.account as unknown as { alloy: { fetch(key: PublicKey): Promise<AlloyAccount> } }).alloy.fetch(new PublicKey(address)));
  const share = await getTokenMetadata(connection, alloy.shareMint, "finalized", TOKEN_2022_PROGRAM_ID);
  if (!share) throw new Error(`Share mint ${alloy.shareMint.toBase58()} carries no TokenMetadata.`);

  const bySymbol = new Map<string, { mint: string; issuer: string }>();
  for (const admission of admissions.instruments) {
    const symbol = admission.instrument.symbol;
    if (!symbol) continue;
    if (bySymbol.has(symbol)) throw new Error(`Two captured instruments share the symbol ${symbol}, so a stand-in cannot be matched by symbol.`);
    bySymbol.set(symbol, { mint: admission.instrument.mint, issuer: admission.issuer });
  }

  const legs = [];
  for (const [index, leg] of alloy.legs.slice(0, alloy.constituentCount).entries()) {
    const metadata = await getTokenMetadata(connection, leg.mint, "finalized", TOKEN_2022_PROGRAM_ID);
    if (!metadata) throw new Error(`Stand-in ${leg.mint.toBase58()} carries no TokenMetadata, so it cannot be matched.`);
    const real = bySymbol.get(metadata.symbol);
    if (!real) throw new Error(`Stand-in ${leg.mint.toBase58()} names ${metadata.symbol}, which is not a captured instrument.`);
    const ledger = BigInt(leg.ledger.toString());
    legs.push({
      index: index + 1,
      symbol: metadata.symbol,
      stand_in: leg.mint.toBase58(),
      stand_in_name: metadata.name,
      real_mint: real.mint,
      issuer: real.issuer,
      atoms_per_share: ((ledger * ONE_SHARE_ATOMS) / BigInt(alloy.supply.toString())).toString(),
    });
  }

  const document = await fetch(share.uri);
  const metadataBody = document.ok ? Buffer.from(await document.arrayBuffer()) : undefined;
  const image = metadataBody ? (JSON.parse(metadataBody.toString("utf8")) as { image?: unknown }).image : undefined;
  const record = {
    producer: `npx tsx scripts/record-founding.ts ${signature} ${address}`,
    recorded_at: new Date().toISOString(),
    cluster: "devnet",
    endpoint,
    hall: REGISTER_HALL_PROGRAM_ID.toBase58(),
    alloy: address,
    id: alloy.id.toString(),
    sponsor: alloy.sponsor.toBase58(),
    share_mint: alloy.shareMint.toBase58(),
    name: share.name,
    symbol: share.symbol,
    uri: share.uri,
    uri_sha256: metadataBody ? createHash("sha256").update(metadataBody).digest("hex") : null,
    image: typeof image === "string" ? image : null,
    founding: {
      signature,
      slot: transaction.slot,
      block_time: transaction.blockTime ? new Date(transaction.blockTime * 1000).toISOString() : null,
      compute_units: transaction.meta?.computeUnitsConsumed ?? null,
    },
    supply_atoms: alloy.supply.toString(),
    locked_genesis_atoms: alloy.lockedGenesis.toString(),
    legs,
    matching: "Each stand-in is matched to the captured mainnet instrument whose symbol its own TokenMetadata names; the founding route wrote that symbol from shared/evidence/admissions.json.",
  };

  const root = "../../shared/evidence/alloys";
  const directory = `${root}/${alloySlug(share.name)}`;
  mkdirSync(directory, { recursive: true });
  writeFileSync(`${directory}/founding.json`, JSON.stringify(record, null, 2) + "\n");
  console.log(`${share.name} (${share.symbol}): ${legs.length} legs recorded in ${directory}/founding.json`);

  // One index of every record, rebuilt from the directories, so the site
  // imports a single file and a new founding cannot be left out of it.
  const records = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(`${root}/${entry.name}/founding.json`))
    .map((entry) => JSON.parse(readFileSync(`${root}/${entry.name}/founding.json`, "utf8")))
    .sort((a, b) => String(a.founding.block_time).localeCompare(String(b.founding.block_time)));
  writeFileSync(`${root}/index.json`, JSON.stringify({ producer: "npx tsx scripts/record-founding.ts", alloys: records }, null, 2) + "\n");
  console.log(`index.json lists ${records.length} founded Alloys`);
  for (const leg of legs) console.log(`  ${leg.index} ${leg.symbol} ${leg.stand_in} -> ${leg.real_mint} ${leg.atoms_per_share} atoms per share`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
