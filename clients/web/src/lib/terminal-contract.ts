import type { components } from "@seametry/api-types";

export type Instrument = components["schemas"]["Instrument"];
export type Decision = components["schemas"]["Decision"];
export type DepthCurve = components["schemas"]["DepthCurve"];
export type Meta = components["schemas"]["Meta"];
export type Alloy = components["schemas"]["Alloy"];
export type CostRow = components["schemas"]["CostRow"];

export type Envelope<T> = {
  data: T;
  meta: Meta;
};

export type InstrumentRegisterResponse = Envelope<Instrument[]>;
export type AlloyRegisterResponse = Envelope<Alloy[]>;

export type AlloyRecordResponse = {
  alloy: Envelope<Alloy>;
  strike: Envelope<CostRow>;
  melt: Envelope<CostRow>;
};

export type InstrumentAssayResponse = {
  instrument: Envelope<Instrument>;
  admissibility: Envelope<Decision>;
  depth: Envelope<DepthCurve>;
};

export type TerminalProblem = {
  title: string;
  detail: string;
  status: number;
};
