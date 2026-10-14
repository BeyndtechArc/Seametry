export type CatalogueState = "available" | "assayed" | "listed";

export const CATALOGUE_STATES: CatalogueState[] = ["available", "assayed", "listed"];

export type CatalogueInstrument = {
  symbol: string;
  /** From the mint's own metadata, the issuer's suffix removed; absent when the mint names none. */
  name?: string;
  mint: string;
  issuer: string;
  /** A mirrored logo's path on this site, absent when none was captured. */
  logo?: string;
  /** Present once Seametry has assayed the instrument. */
  grade?: "Entitlement" | "Certificate" | "Interest" | "Ungraded";
  capturedAt: string;
  slot: number;
  state: CatalogueState;
};

export type CatalogueResponse = {
  data: CatalogueInstrument[];
  meta: {
    total: number;
    /** When the newest of the issuer listings was read from the chain. */
    capturedAt: string;
    filtered: number;
    /** Listings in each state under the current search and issuer, before the state filter. */
    states: Record<CatalogueState, number>;
    page: number;
    pages: number;
    pageSize: number;
    issuers: string[];
  };
};
