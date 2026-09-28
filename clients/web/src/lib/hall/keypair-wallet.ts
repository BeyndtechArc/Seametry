import { Keypair, Transaction, VersionedTransaction } from "@solana/web3.js";
import type { Wallet } from "@coral-xyz/anchor";

/** The minimal @coral-xyz/anchor Wallet interface, over a single Keypair, for server-side signing only. */
export class KeypairWallet implements Wallet {
  constructor(readonly payer: Keypair) {}

  get publicKey() {
    return this.payer.publicKey;
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (tx instanceof VersionedTransaction) {
      tx.sign([this.payer]);
    } else {
      tx.partialSign(this.payer);
    }
    return tx;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    return Promise.all(txs.map((tx) => this.signTransaction(tx)));
  }
}
