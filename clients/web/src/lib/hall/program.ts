import { AnchorProvider, BN, Program, type Idl } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";
import idl from "./idl.json";

/**
 * chain/target/idl is gitignored (chain/.gitignore excludes target/ outright),
 * so this file is committed here instead: generated with `anchor idl build`
 * in chain/, the same source-of-truth-is-generated pattern the design tokens
 * already use. Regenerate the same way if chain/programs/hall's accounts or
 * instructions change; nothing here should be hand edited.
 *
 * `anchor idl build` produced only the IDL, not `anchor build`'s generated
 * TypeScript types (`target/types/hall.ts`), so callers get Anchor's own
 * loose `Program<Idl>` typing rather than a type that knows this program's
 * specific account and instruction names. `.account.<name>` and
 * `.methods.<name>` calls on the result need a narrow `as any` at the call
 * site for that reason; the account and argument names themselves are still
 * checked at runtime, against the real IDL, on every call.
 */
export function hallProgram(provider: AnchorProvider, hall: PublicKey): Program<Idl> {
  // The IDL is the same for both devnet Halls; only the address differs, so
  // the caller's Hall replaces the one the IDL was generated with.
  return new Program({ ...(idl as Idl), address: hall.toBase58() }, provider);
}

/** chain/programs/hall/src/state.rs's Claim, as Anchor's Borsh coder decodes it (ordinary Borsh, not zero-copy; see decode.ts for why Alloy needs a different route). */
export interface DecodedClaim {
  alloy: PublicKey;
  owner: PublicKey;
  entries: { units: BN; index: BN; epoch: BN }[];
}

/**
 * Reads a Claim account by its typed shape, the one place this program's
 * loose `Program<Idl>` typing (see hallProgram's doc comment) needs a single
 * narrow, named cast rather than `any` at every call site.
 */
export async function fetchClaim(program: Program<Idl>, claimPda: PublicKey): Promise<DecodedClaim | null> {
  const account = program.account as unknown as { claim: { fetchNullable(pda: PublicKey): Promise<DecodedClaim | null> } };
  return account.claim.fetchNullable(claimPda);
}
