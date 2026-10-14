import names from "../../../../shared/evidence/instrument-names.json";

// Names were decoded from the same captured mint bytes as the admission
// snapshot. No mutable metadata URL participates in this label.
export function instrumentName(mint: string): string | undefined {
  return (names as Record<string, string>)[mint];
}
