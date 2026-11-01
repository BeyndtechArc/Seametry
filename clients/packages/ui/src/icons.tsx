import type { SVGProps } from "react";
import { ArrowClockwise, ArrowLeft, ArrowRight, ArrowSquareOut, ArrowUpRight, Bank, Basket, BookOpenText, CaretDown, Certificate, ChartPie, Check, CircleHalf, CircleNotch, ClockCounterClockwise, Copy, CurrencyDollar, Desktop, EnvelopeSimple, Flask, FunnelSimple, GoogleLogo, Info, Key, MagnifyingGlass, Moon, Plus, Question, SealCheck, SquaresFour, Sun, Wallet, X, XLogo } from "@phosphor-icons/react/ssr";

// Phosphor supplies the generic interface symbols (foundations.md section 9).
// The ssr entry needs no React context, so the same Icon renders in server
// and client components. Regular weight draws a 16-unit stroke on a 256 grid,
// which is the house 1.5px line at 24px.
const glyphs = {
  activity: ClockCounterClockwise,
  "arrow-up-right": ArrowUpRight,
  back: ArrowLeft,
  assay: Flask,
  buy: Basket,
  certificate: Certificate,
  check: Check,
  close: X,
  confirm: SealCheck,
  copy: Copy,
  currency: CurrencyDollar,
  desk: SquaresFour,
  entitlement: Bank,
  expand: CaretDown,
  external: ArrowSquareOut,
  filter: FunnelSimple,
  google: GoogleLogo,
  hall: Bank,
  info: Info,
  interest: ChartPie,
  key: Key,
  mail: EnvelopeSimple,
  moon: Moon,
  plus: Plus,
  next: ArrowRight,
  partial: CircleHalf,
  read: BookOpenText,
  refresh: ArrowClockwise,
  running: CircleNotch,
  search: MagnifyingGlass,
  sun: Sun,
  system: Desktop,
  ungraded: Question,
  wallet: Wallet,
  "x-account": XLogo,
} as const;

export type IconName = keyof typeof glyphs;

export function Icon({ name, ...svgProps }: SVGProps<SVGSVGElement> & { name: IconName }) {
  const Glyph = glyphs[name];
  return <Glyph {...svgProps} weight="regular" aria-hidden="true" />;
}
