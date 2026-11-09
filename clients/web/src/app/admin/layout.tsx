import type { ReactNode } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { adminAccess } from "@/lib/admin";
import { safeReturnPath } from "@/lib/return-path";
import { AdminShell } from "./_shell/admin-shell";

export const dynamic = "force-dynamic";

// No metadata export: a title naming this area would reach the head of the
// 404 a non-admin is shown, and the Admin's existence is not advertised.

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const requested = await headers();
  const access = await adminAccess(requested.get("cookie"));
  // Signed out, the way in is sign-in and back to the exact page asked for.
  // The path comes from the proxy; anything not an Admin path on this site
  // returns to the Overview instead.
  if (access.state === "signed-out") {
    const asked = safeReturnPath(requested.get("x-request-path") ?? undefined);
    const back = asked && (asked === "/admin" || asked.startsWith("/admin/") || asked.startsWith("/admin?")) ? asked : "/admin";
    redirect(`/sign-in?next=${encodeURIComponent(back)}`);
  }
  // Signed in, who is an admin stays the Gateway's answer, and anyone else
  // sees the plain 404 with none of the Admin's frame.
  if (access.state !== "admitted") notFound();
  return <AdminShell email={access.session.email}>{children}</AdminShell>;
}
