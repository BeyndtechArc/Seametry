"use client";

import { useEffect, useState } from "react";
import { LotMark } from "@seametry/ui";
import { METADATA_ORIGIN } from "@/lib/compose/identity";
import type { AlloyIdentity } from "@/lib/alloys/records";
import type { Alloy } from "@/lib/terminal-contract";

const sameOriginPath = (url: unknown) => (typeof url === "string" && url.startsWith(`${METADATA_ORIGIN}/`) ? url.slice(METADATA_ORIGIN.length) : undefined);

/**
 * The image an Alloy's share mint names, read from the metadata its URI
 * points at when no founding record names one. Only metadata this site hosts
 * is read, and only a same-origin image is drawn: the site's CSP loads images
 * from this origin alone, and another host's file could change under us.
 */
function useMetadataImage(alloy: Alloy, recorded: string | undefined): string | undefined {
  const path = recorded ? undefined : sameOriginPath(alloy.metadata?.uri);
  const [answer, setAnswer] = useState<{ path: string; image?: string }>();
  useEffect(() => {
    if (!path) return;
    let current = true;
    fetch(path)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((body) => current && setAnswer({ path, image: sameOriginPath(body?.image) }))
      .catch(() => current && setAnswer({ path }));
    return () => {
      current = false;
    };
  }, [path]);
  return recorded ?? (answer?.path === path ? answer?.image : undefined);
}

export function AlloyArtwork({ alloy, identity, className, size, alt }: { alloy: Alloy; identity: AlloyIdentity; className: string; size: number; alt: string }) {
  const artwork = useMetadataImage(alloy, identity.artwork);
  return artwork ? (
    // eslint-disable-next-line @next/next/no-img-element -- next/image writes an inline style attribute, which this site's CSP refuses.
    <img className={className} src={artwork} alt={alt} width={size} height={size} />
  ) : (
    <LotMark symbol={identity.symbol ?? identity.title} size="header" />
  );
}
