// Where an Alloy's token metadata is published. The URI written into the
// share mint is permanent, so it is derived from the name by one rule and
// the founding refuses a name with no published metadata behind it.

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
