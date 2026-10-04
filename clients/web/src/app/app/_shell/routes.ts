// The one route list the App shell draws from (components.md, App shell):
// the top bar's tabs and the narrow register both read it, so they cannot disagree.

export type AppRoute = { label: string; href: string; isActive: (pathname: string) => boolean };
export type AppGroup = { group: string; routes: AppRoute[] };

const exactly = (href: string) => (pathname: string) => pathname === href;
const within = (href: string, except: string[] = []) => (pathname: string) =>
  (pathname === href || pathname.startsWith(`${href}/`)) && !except.some((path) => pathname === path);

export const appGroups: AppGroup[] = [
  { group: "Desk", routes: [{ label: "Overview", href: "/app", isActive: exactly("/app") }] },
  { group: "Buy", routes: [{ label: "Build a basket", href: "/app/allocation", isActive: within("/app/allocation") }] },
  {
    group: "Hall",
    routes: [
      { label: "Alloy No. 1", href: "/app/alloys/storm", isActive: exactly("/app/alloys/storm") },
      { label: "Alloys", href: "/app/alloys", isActive: within("/app/alloys", ["/app/alloys/storm"]) },
      { label: "Demonstration", href: "/app/hall", isActive: within("/app/hall") },
    ],
  },
  { group: "Assay", routes: [{ label: "Instruments", href: "/app/instruments", isActive: within("/app/instruments") }] },
];

/** The reading pages, kept out of the product tabs: explanation lives there, not in the product. */
export const readingRoutes = [
  { label: "How it works", href: "/how-it-works", icon: "read" as const },
  { label: "The Key", href: "/the-key", icon: "key" as const },
];
