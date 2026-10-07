import type { SVGProps } from "react";
import { ArrowRight, ArrowUpRight, Bank, Basket, BookOpenText, Certificate, ChartPie, Check, CircleNotch, Flask, FunnelSimple, Info, Key, MagnifyingGlass, Moon, Question, SealCheck, SquaresFour, Sun, Wallet, X } from "@phosphor-icons/react/ssr";

// Phosphor supplies the generic interface symbols (foundations.md section 9).
// The ssr entry needs no React context, so the same Icon renders in server
// and client components. Regular weight draws a 16-unit stroke on a 256 grid,
// which is the house 1.5px line at 24px.
const glyphs = {
  "arrow-up-right": ArrowUpRight,
  assay: Flask,
  buy: Basket,
  certificate: Certificate,
  check: Check,
  close: X,
  confirm: SealCheck,
  desk: SquaresFour,
  entitlement: Bank,
  filter: FunnelSimple,
  hall: Bank,
  info: Info,
  interest: ChartPie,
  key: Key,
  moon: Moon,
  next: ArrowRight,
  read: BookOpenText,
  running: CircleNotch,
  search: MagnifyingGlass,
  sun: Sun,
  ungraded: Question,
  wallet: Wallet,
} as const;

export type IconName = keyof typeof glyphs;

export function Icon({ name, ...svgProps }: SVGProps<SVGSVGElement> & { name: IconName }) {
  const Glyph = glyphs[name];
  return <Glyph {...svgProps} weight="regular" aria-hidden="true" />;
}
