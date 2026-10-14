export type CatalogueState = "available" | "assayed" | "listed";

export type CatalogueInstrument = {
  symbol: string;
  name: string;
  mint: string;
  issuer: string;
  capturedAt: string;
  slot: number;
  state: CatalogueState;
};

export type CatalogueResponse = {
  data: CatalogueInstrument[];
  meta: {
    total: number;
    filtered: number;
    page: number;
    pages: number;
    pageSize: number;
    issuers: string[];
  };
};
