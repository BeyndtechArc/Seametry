// Turns whatever stopped a founding into a sentence a sponsor can act on,
// keeping the raw message beside it. Each sentence says what did not happen,
// since "did my wallet sign?" and "did I spend anything?" are the first two
// questions after a failure. Free of wallet and Solana imports so the
// wording is testable on its own.

export type FoundingStage = "prepare" | "sign" | "confirm";
export type StageProblem = { plain: string; technical?: string };

const DECLINED = /reject|declin|denied|cancel/i;
const SIMULATION = /simulation failed|invalid instruction data|custom program error|InstructionError/i;

export function foundingProblem(stage: FoundingStage, error: unknown): StageProblem {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const named = error instanceof Error ? error.name : "";

  if (stage === "prepare") {
    if (error instanceof TypeError) {
      return { plain: "The founding service could not be reached, so nothing was prepared and your wallet was not asked to sign. Check the connection and try again.", technical: message };
    }
    if (SIMULATION.test(message)) {
      return {
        plain: "Devnet refused one of the transactions that prepare your stand-ins. Nothing was founded and your wallet was not asked to sign. Try again in a minute.",
        technical: message,
      };
    }
    // The route's own refusals are already written as sentences for a sponsor.
    return { plain: message || "Preparing the founding did not complete. Nothing was founded and your wallet was not asked to sign." };
  }

  if (stage === "sign") {
    if (DECLINED.test(message) || /WalletSign/.test(named)) {
      return { plain: "You declined to sign, so nothing was founded and nothing left your wallet. The prepared stand-ins stay on devnet unused." };
    }
    return {
      plain: "The founding transaction could not be put in front of your wallet. Nothing was signed and nothing was founded. Try again in a moment.",
      technical: message,
    };
  }

  if (/The Hall refused the founding/.test(message)) {
    return { plain: "The founding reached devnet and the Hall refused it. Nothing was founded; the network fee for the attempt was spent.", technical: message };
  }
  if (SIMULATION.test(message)) {
    return { plain: "Devnet refused the signed founding before it was sent. Nothing was founded and nothing was spent.", technical: message };
  }
  return {
    plain: "Your signed founding was sent, but devnet did not confirm it in time. It may still land: open the Alloys register in a minute before trying again.",
    technical: message,
  };
}
