// The opt-in's wallet line, apart from the component so its wording is
// tested as text.
export function walletOptInLabel(wallet: string): string {
  return `Keep the wallet this browser shows as connected, ${wallet.slice(0, 4)}…${wallet.slice(-4)}, with the address. It is kept as unverified: nothing here proves the wallet is yours.`;
}
