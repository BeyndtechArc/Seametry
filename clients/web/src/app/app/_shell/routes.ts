// The one route list the App shell draws from (components.md, App shell):
// the top bar's tabs and the narrow register both read it, so they cannot disagree.

import type { IconName } from "@seametry/ui/icons";

export type AppRoute = { label: string; href: string; isActive: (pathname: string) => boolean };
export type AppGroup = { group: string; icon: IconName; routes: AppRoute[] };

const exactly = (href: string) => (pathname: string) => pathname === href;
const within = (href: string) => (pathname: string) => pathname === href || pathname.startsWith(`${href}/`);

export const appGroups: AppGroup[] = [
  { group: "Desk", icon: "desk", routes: [{ label: "Overview", href: "/app", isActive: exactly("/app") }] },
  { group: "Buy", icon: "buy", routes: [{ label: "Build a basket", href: "/app/allocation", isActive: within("/app/allocation") }] },
  {
    group: "Hall",
    icon: "hall",
    routes: [
      { label: "Alloys", href: "/app/alloys", isActive: within("/app/alloys") },
      { label: "Compose", href: "/app/compose", isActive: within("/app/compose") },
      { label: "Demo", href: "/app/hall", isActive: within("/app/hall") },
    ],
  },
  { group: "Assay", icon: "assay", routes: [{ label: "Instruments", href: "/app/instruments", isActive: within("/app/instruments") }] },
];

/** The reading pages, kept out of the product tabs: explanation lives there, not in the product. */
export const readingRoutes = [
  { label: "How it works", href: "/how-it-works", icon: "read" as const },
  { label: "The Key", href: "/the-key", icon: "key" as const },
];
