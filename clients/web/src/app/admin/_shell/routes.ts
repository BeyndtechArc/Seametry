// components.md, Admin shell: the one route list the rail and the narrow
// list both draw. A page joins it in the change that ships the page.
export type AdminRoute = { label: string; href: string; /** Deeper paths that are this page's own, such as one person under People. */ owns?: string };
export type AdminGroup = { label: string; routes: AdminRoute[] };

export const adminGroups: AdminGroup[] = [
  {
    label: "Record",
    routes: [
      { label: "Overview", href: "/admin" },
      { label: "Funnel", href: "/admin/funnel" },
      { label: "Sources", href: "/admin/sources" },
      { label: "Wallets", href: "/admin/wallets" },
      { label: "Activity", href: "/admin/activity" },
    ],
  },
  {
    label: "People",
    routes: [{ label: "People", href: "/admin/people", owns: "/admin/people/" }],
  },
  {
    label: "Reach",
    routes: [{ label: "Email opt-ins", href: "/admin/opt-ins" }],
  },
  {
    label: "Operations",
    routes: [{ label: "System", href: "/admin/system" }],
  },
];

export function isCurrent(route: AdminRoute, pathname: string): boolean {
  return pathname === route.href || (route.owns !== undefined && pathname.startsWith(route.owns));
}
