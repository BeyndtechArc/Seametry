import type { SVGProps } from "react";
import { ArrowUpRight, Bank, Basket, BookOpenText, Check, CircleNotch, Flask, Key, Moon, SealCheck, SquaresFour, Sun, Wallet, X } from "@phosphor-icons/react/ssr";

// Phosphor supplies the generic interface symbols (foundations.md section 9).
// The ssr entry needs no React context, so the same Icon renders in server
// and client components. Regular weight draws a 16-unit stroke on a 256 grid,
// which is the house 1.5px line at 24px.
const glyphs = {
  "arrow-up-right": ArrowUpRight,
  assay: Flask,
  buy: Basket,
  check: Check,
  close: X,
  confirm: SealCheck,
  desk: SquaresFour,
  hall: Bank,
  key: Key,
  moon: Moon,
  read: BookOpenText,
  running: CircleNotch,
  sun: Sun,
  wallet: Wallet,
} as const;

export type IconName = keyof typeof glyphs;

export function Icon({ name, ...svgProps }: SVGProps<SVGSVGElement> & { name: IconName }) {
  const Glyph = glyphs[name];
  return <Glyph {...svgProps} weight="regular" aria-hidden="true" />;
}
