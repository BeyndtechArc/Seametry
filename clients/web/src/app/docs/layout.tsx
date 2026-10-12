import type { ReactNode } from "react";
import type { Node } from "fumadocs-core/page-tree";
import { source } from "@/lib/docs/source";
import { PublicShell } from "../public-shell";
import { DocsNav, type DocsNavItem } from "./docs-nav";
import styles from "./docs.module.css";

// Folders are flattened into the order they read in: a folder's own index
// page first, then its children. Separators and link entries come through as
// written in meta.json.
function flatten(nodes: Node[]): DocsNavItem[] {
  return nodes.flatMap((node): DocsNavItem[] => {
    if (node.type === "separator") return [{ kind: "separator", name: String(node.name ?? "") }];
    if (node.type === "page") return [{ kind: "page", name: String(node.name), url: node.url, external: Boolean(node.external) }];
    const index = node.index ? [{ kind: "page" as const, name: String(node.index.name), url: node.index.url, external: false }] : [];
    return [...index, ...flatten(node.children)];
  });
}

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <PublicShell current="docs">
      <div className={styles.layout}>
        <DocsNav items={flatten(source.pageTree.children)} />
        <div className={styles.main}>{children}</div>
      </div>
    </PublicShell>
  );
}
