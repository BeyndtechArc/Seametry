// The one route list the App shell draws from (components.md, App shell):
// the top bar's tabs and the narrow register both read it, so they cannot disagree.

import type { IconName } from "@seametry/ui/icons";

export type AppRoute = { label: string; href: string; isActive: (pathname: string) => boolean };
export type AppGroup = { group: string; icon: IconName; routes: AppRoute[] };

const exactly = (href: string) => (pathname: string) => pathname === href;
const within = (href: string) => (pathname: string) => pathname === href || pathname.startsWith(`${href}/`);
const buildHref = "/app/baskets/build";

export const appGroups: AppGroup[] = [
  { group: "Desk", icon: "desk", routes: [{ label: "Overview", href: "/app", isActive: exactly("/app") }, { label: "Holdings", href: "/app/positions", isActive: within("/app/positions") }] },
  {
    group: "Allocation",
    icon: "buy",
    routes: [
      { label: "Baskets", href: "/app/baskets", isActive: (pathname: string) => within("/app/baskets")(pathname) && !within(buildHref)(pathname) },
      // /app/allocation is the builder's original address; old links still land on it.
      { label: "Allocation", href: buildHref, isActive: (pathname: string) => within(buildHref)(pathname) || within("/app/allocation")(pathname) },
    ],
  },
  {
    group: "Hall",
    icon: "hall",
    routes: [
      { label: "Alloys", href: "/app/alloys", isActive: within("/app/alloys") },
      { label: "Sponsor", href: "/app/compose", isActive: within("/app/compose") },
    ],
  },
  { group: "Assay", icon: "assay", routes: [{ label: "Instruments", href: "/app/instruments", isActive: within("/app/instruments") }] },
];

/** The reading pages, kept out of the product tabs: explanation lives there, not in the product. */
export const readingRoutes = [
  { label: "How it works", href: "/docs/how-it-works", icon: "read" as const },
  { label: "The Key", href: "/docs/the-key", icon: "key" as const },
];

export const mobileRoutes = [
  { ...appGroups[0].routes[0], isActive: (pathname: string) => pathname === "/app" || within("/app/positions")(pathname), icon: "desk" as const },
  { ...appGroups[3].routes[0], icon: "assay" as const },
  { ...appGroups[1].routes[1], icon: "plus" as const, primary: true },
  { ...appGroups[2].routes[0], icon: "hall" as const },
  { ...appGroups[2].routes[1], icon: "buy" as const },
];
