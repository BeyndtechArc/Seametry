import { PublicKey } from "@solana/web3.js";

// Devnet only, always. This demo never touches mainnet: docs/prd/HALL.md
// section 6, "devnet builds are upgradeable, and every surface says so."
export const DEVNET_RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_HALL_DEMO_RPC ?? "https://api.devnet.solana.com";

// The demo founds an Alloy on every run, so it stays on the first devnet
// deployment, where the earlier test Alloys already live, and the register
// on the new Hall (server/internal/basket HallDevnetProgramID) holds only
// deliberately founded Alloys. idl.json carries the same address. Both
// programs are built from the same source and differ only in the program id
// compiled into them: rebuilding today's source with this id reproduces the
// deployed binary byte for byte.
export const DEMO_HALL_PROGRAM_ID = new PublicKey(
  "4wmfRdQguyhGCvZe4FXHo7Kpx5aWbRBHPBbs8k6XRjDx"
);

// The Hall the Gateway's register reads, where Alloys are founded on
// purpose. The same address as server/internal/basket HallDevnetProgramID;
// a test checks the two agree.
export const REGISTER_HALL_PROGRAM_ID = new PublicKey(
  "GB1hX1FXQcAUWU23Ji6RtvhTzCKz84ScUsBeD7CqQnjE"
);

// chain/programs/hall/src/state.rs
export const ALLOY_SEED = Buffer.from("alloy");
export const SHARE_SEED = Buffer.from("share");
export const LOCKED_SEED = Buffer.from("locked");
export const CLAIM_SEED = Buffer.from("claim");
export const MAX_CONSTITUENTS = 12;
export const SHARE_DECIMALS = 6;
// One whole share in share atoms, as wallets show the share mint.
export const ONE_SHARE_ATOMS = 10n ** BigInt(SHARE_DECIMALS);

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
