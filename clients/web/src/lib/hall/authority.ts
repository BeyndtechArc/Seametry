import "server-only";
import { cache } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { DEVNET_RPC_ENDPOINT, REGISTER_HALL_PROGRAM_ID } from "./constants";

const UPGRADEABLE_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

export type HallAuthority =
  | { state: "observed"; program: string; programData: string; authority: string | null; deployedSlot: bigint; slot: number; observedAt: string; source: string }
  | { state: "unavailable"; program: string; reason: string; source: string };

// HALL_DEVNET_RPC_URL lets the tests answer from a fixture instead of the
// public endpoint; production reads the same devnet endpoint the Hall does.
function endpoint() {
  return process.env.HALL_DEVNET_RPC_URL?.trim() || DEVNET_RPC_ENDPOINT;
}

/**
 * Reads the register Hall's upgrade authority from devnet as the loader
 * records it, rather than stating it. The upgradeable loader's program account
 * is a u32 tag (2, Program) and the programdata address; the programdata
 * account is a u32 tag (3, ProgramData), the u64 deployment slot, and an
 * Option<Pubkey> authority: one byte, then 32 when present. None is the
 * program made final.
 */
// cache(): one devnet read per request, however many parts of a page show it.
export const readHallAuthority = cache(async (): Promise<HallAuthority> => {
  const program = REGISTER_HALL_PROGRAM_ID;
  const source = "Solana devnet RPC, upgradeable loader";
  try {
    const connection = new Connection(endpoint(), "confirmed");
    const account = await connection.getAccountInfo(program, "confirmed");
    if (!account) return { state: "unavailable", program: program.toBase58(), reason: "The program account was not found on devnet.", source };
    if (!account.owner.equals(UPGRADEABLE_LOADER)) {
      return { state: "unavailable", program: program.toBase58(), reason: `The program is owned by ${account.owner.toBase58()}, not the upgradeable loader, so it has no upgrade authority to read.`, source };
    }
    if (account.data.length < 36 || account.data.readUInt32LE(0) !== 2) {
      return { state: "unavailable", program: program.toBase58(), reason: "The program account is not in the loader's Program layout.", source };
    }
    const programData = new PublicKey(account.data.subarray(4, 36));
    const { context, value } = await connection.getAccountInfoAndContext(programData, "confirmed");
    if (!value || value.data.length < 13 || value.data.readUInt32LE(0) !== 3) {
      return { state: "unavailable", program: program.toBase58(), reason: "The programdata account was missing or not in the loader's ProgramData layout.", source };
    }
    const present = value.data[12] === 1;
    if (present && value.data.length < 45) {
      return { state: "unavailable", program: program.toBase58(), reason: "The programdata account names an authority but is too short to hold it.", source };
    }
    return {
      state: "observed",
      program: program.toBase58(),
      programData: programData.toBase58(),
      authority: present ? new PublicKey(value.data.subarray(13, 45)).toBase58() : null,
      deployedSlot: value.data.readBigUInt64LE(4),
      slot: context.slot,
      observedAt: new Date().toISOString(),
      source,
    };
  } catch (error) {
    return { state: "unavailable", program: program.toBase58(), reason: `Devnet did not answer: ${error instanceof Error ? error.message : String(error)}`, source };
  }
});
