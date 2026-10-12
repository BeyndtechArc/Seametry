"use client";

import { useState } from "react";
import styles from "./components.module.css";

type LotMarkSize = "row" | "list" | "header";
const sizes: Record<LotMarkSize, string> = {
  row: "",
  list: styles.lotMarkList,
  header: styles.lotMarkHeader,
};

/**
 * Issuer logos are mirrored and mint-bound. The image path may still
 * disappear from an old deployment or be refused by a browser; a broken
 * image is never shown as an empty tile. This fallback does NOT substitute
 * the identity of another issuer's representation of the same stock.
 */
export function LotMarkImage({
  symbol,
  src,
  size = "row",
}: {
  symbol: string;
  src?: string;
  size?: LotMarkSize;
}) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const className = [styles.lotMark, sizes[size]].filter(Boolean).join(" ");
  if (!src || src === failedSrc) {
    return (
      <span className={className + " " + styles.lotMarkLettered} aria-hidden="true" data-testid="lot-mark">
        {symbol.slice(0, 2)}
      </span>
    );
  }
  return (
    <img
      className={className}
      src={src}
      alt=""
      width={40}
      height={40}
      loading="lazy"
      onError={() => setFailedSrc(src)}
      // The server renders this img, so a request that fails before hydration
      // fires its error event before onError exists. A finished request with
      // no pixels is that same failure, read when React attaches.
      ref={(image) => {
        if (image?.complete && image.naturalWidth === 0) setFailedSrc(src);
      }}
      data-testid="lot-mark"
    />
  );
}
