// Turns whatever stopped a founding into a sentence a sponsor can act on,
// keeping the raw message beside it. Each sentence says what did not happen,
// since "did my wallet sign?" and "did I spend anything?" are the first two
// questions after a failure. Free of wallet and Solana imports so the
// wording is testable on its own.

/** "build" assembles the transaction in the browser before the wallet sees it; it is shown as part of signing. */
export type FoundingStage = "prepare" | "build" | "sign" | "confirm";
export type StageProblem = { plain: string; technical?: string };

const SIMULATION = /simulation failed|invalid instruction data|custom program error|InstructionError/i;

// Wallet adapters wrap every signing failure in one WalletSignTransactionError,
// so its name says nothing about why. Only the wallet's own rejection is a
// decline: EIP-1193's 4001, which Phantom and Solflare use, or its wording.
// Reading the name as a decline told a sponsor on 6 October 2026 that they
// had declined when they had not.
function isDecline(error: unknown): boolean {
  const inner = (error as { error?: { code?: unknown; message?: unknown } } | undefined)?.error;
  const code = (error as { code?: unknown } | undefined)?.code ?? inner?.code;
  if (code === 4001) return true;
  const text = `${error instanceof Error ? error.message : ""} ${typeof inner?.message === "string" ? inner.message : ""}`;
  return /user rejected|user denied|user declined|rejected the request/i.test(text);
}

/** Everything known about the error, inner cause and code included, for the Technical detail. */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error ?? "No error was given.");
  const inner = (error as { error?: unknown }).error;
  const innerText = inner instanceof Error ? `${inner.name}: ${inner.message}` : inner !== undefined ? JSON.stringify(inner) : "";
  return [`${error.name}: ${error.message}`, innerText && `Cause: ${innerText}`].filter(Boolean).join("\n");
}

export function foundingProblem(stage: FoundingStage, error: unknown): StageProblem {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const technical = describe(error);

  if (stage === "prepare") {
    if (error instanceof TypeError) {
      return { plain: "The founding service could not be reached, so nothing was prepared and your wallet was not asked to sign. Check the connection and try again.", technical };
    }
    if (SIMULATION.test(message)) {
      return {
        plain: "Devnet refused one of the transactions that prepare your stand-ins. Nothing was founded and your wallet was not asked to sign. Try again in a minute.",
        technical,
      };
    }
    // The route's own refusals are already written as sentences for a sponsor.
    return { plain: message || "Preparing the founding did not complete. Nothing was founded and your wallet was not asked to sign." };
  }

  if (stage === "build") {
    return {
      plain: "The founding transaction could not be assembled from devnet, so your wallet was not asked to sign and nothing was founded. Try again in a moment.",
      technical,
    };
  }

  if (stage === "sign") {
    if (isDecline(error)) {
      return { plain: "You declined to sign, so nothing was founded and nothing left your wallet." };
    }
    return {
      plain: "Your wallet did not complete the founding, so nothing was founded. If your wallet is set to a test network, it must be Solana Devnet, not Testnet.",
      technical,
    };
  }

  if (/The Hall refused the founding/.test(message)) {
    return { plain: "The founding reached devnet and the Hall refused it. Nothing was founded; the network fee for the attempt was spent.", technical };
  }
  if (SIMULATION.test(message)) {
    return { plain: "Devnet refused the signed founding before it was sent. Nothing was founded and nothing was spent.", technical };
  }
  return {
    plain: "Your signed founding was sent, but devnet did not confirm it in time. It may still land: open the Alloys register in a minute before trying again.",
    technical,
  };
}
