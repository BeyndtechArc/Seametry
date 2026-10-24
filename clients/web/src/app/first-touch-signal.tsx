"use client";

import { useEffect } from "react";
import { captureFirstTouch } from "@/lib/first-touch";

/**
 * Keeps this browser's first touch on every page. It was part of the
 * site-wide wallet provider until that provider moved to the pages that use
 * a wallet, so a public page no longer downloads the wallet and Solana
 * libraries just to record where a visitor arrived.
 */
export function FirstTouchSignal() {
  useEffect(captureFirstTouch, []);
  return null;
}
