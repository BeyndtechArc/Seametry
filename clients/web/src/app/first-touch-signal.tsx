"use client";

import { useEffect } from "react";
import { captureFirstTouch, countVisit } from "@/lib/first-touch";

/**
 * Keeps this browser's first touch, and counts the session's first page, on
 * every page. It was part of the site-wide wallet provider until that
 * provider moved to the pages that use a wallet, so a public page no longer
 * downloads the wallet and Solana libraries just to record where a visitor
 * arrived.
 */
export function FirstTouchSignal() {
  useEffect(() => {
    captureFirstTouch();
    countVisit();
  }, []);
  return null;
}
