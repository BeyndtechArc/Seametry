import { theme, tokens } from "@shared/tokens";

// The web's generated tokens, read as numbers and colours. Light is the
// default mode (SKILL.md); dark follows once the app has a mode control.
export const colors = theme.light;
export const space = tokens.space;
export const fontSize = tokens.font.size;
export const radius = tokens.radius;
export const size = tokens.size;

/**
 * Sentient, Switzer and Fragment Mono are fetched for the web build and never
 * committed (clients/web/fonts/README.md). The app uses each family's system
 * fallback from the same token until those files are bundled for it.
 */
export const font = {
  display: "Georgia",
  ui: undefined,
  digest: "monospace",
} as const;
