// Earlier Alloys use name-based, manually published files. New Alloys use an
// address-specific endpoint backed by their own on-chain share metadata.

export const METADATA_ORIGIN = "https://www.seametry.xyz";

export function alloySlug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** The path the metadata is served from, on this site. */
export function metadataPath(name: string): string {
  return `/alloys/${alloySlug(name)}/metadata.json`;
}

/** The permanent URI written into the share mint. */
export function metadataUri(name: string): string {
  return `${METADATA_ORIGIN}${metadataPath(name)}`;
}

/** Each founded Alloy has a distinct URI even when names or symbols repeat. */
export function registeredMetadataPath(address: string): string {
  return `/alloys/${address}/metadata.json`;
}

export function registeredMetadataUri(address: string): string {
  return `${METADATA_ORIGIN}${registeredMetadataPath(address)}`;
}
