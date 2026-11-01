import { theme as tokens } from "./generated/tokens";

// Server-safe half of the colour mode: plain values the root layout can read
// without crossing into the client module (theme-control.tsx).

export type ThemeName = "dark" | "light";

export const themeStorageKey = "seametry-theme-v1";
export const darkQuery = "(prefers-color-scheme: dark)";

/** The browser chrome colour per mode, the ground the page paints. */
export const themeColor: Record<ThemeName, string> = {
  light: tokens.light.surface.ground,
  dark: tokens.dark.surface.ground,
};

/**
 * Runs inline in the document head before first paint (layout.tsx), so a
 * stored or system choice never flashes the default. Kept in step with
 * readPreference and useTheme in theme-control.tsx; tests/theme.spec.ts
 * checks the first parsed state.
 */
export const themeBootScript = `(function(){try{var s=localStorage.getItem(${JSON.stringify(themeStorageKey)}),p=location.pathname,d=(p==="/app"||p.indexOf("/app/")===0)?"dark":"light",t=s==="dark"||s==="light"?s:s==="system"?(matchMedia(${JSON.stringify(darkQuery)}).matches?"dark":"light"):d;document.documentElement.setAttribute("data-theme",t);document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute("content",t==="dark"?${JSON.stringify(themeColor.dark)}:${JSON.stringify(themeColor.light)});});}catch(e){}})();`;

