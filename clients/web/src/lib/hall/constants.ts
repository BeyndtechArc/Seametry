import { PublicKey } from "@solana/web3.js";

// Devnet only, always. This demo never touches mainnet: docs/prd/HALL.md
// section 6, "devnet builds are upgradeable, and every surface says so."
export const DEVNET_RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_HALL_DEMO_RPC ?? "https://api.devnet.solana.com";

export const HALL_PROGRAM_ID = new PublicKey(
  "4wmfRdQguyhGCvZe4FXHo7Kpx5aWbRBHPBbs8k6XRjDx"
);

// chain/programs/hall/src/state.rs
export const ALLOY_SEED = Buffer.from("alloy");
export const SHARE_SEED = Buffer.from("share");
export const LOCKED_SEED = Buffer.from("locked");
export const CLAIM_SEED = Buffer.from("claim");
export const MAX_CONSTITUENTS = 12;
export const SHARE_DECIMALS = 6;

// chain/tools/devnet-demo/src/main.rs's STOCK_DECIMALS and demo deposit sizes,
// reused so the on-chain shape this page produces matches the shape the
// devnet-demo tool already proved end to end (see the commit that refreshed
// shared/evidence/hall-demo/transcript-devnet.json).
export const STOCK_DECIMALS = 6;
export const GENESIS_DEPOSIT_A = 5_000_000n;
export const GENESIS_DEPOSIT_B = 3_000_000n;
export const GENESIS_SHARES = 1_000_000n;
export const HOLDER_FUNDS = 1_000_000_000n;

// The exact extension set HALL.md section 3 cites for real xStocks mints:
// "xStocks mints carry PermanentDelegate, FreezeAuthority and Pausable, with
// Transfer Hooks initialized but disabled." FreezeAuthority is always present
// on a mint that declares one at initializeMint2, not a separate extension.
export const MOCK_STOCK_LABELS = ["A", "B"] as const;
