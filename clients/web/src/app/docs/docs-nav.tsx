"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "@seametry/ui/icons";
import styles from "./docs.module.css";

export type DocsNavItem =
  | { kind: "page"; name: string; url: string; external: boolean }
  | { kind: "separator"; name: string };

type Result = { id: string; url: string; type: "page" | "heading" | "text"; content: string };
type Search = { state: "idle" } | { state: "searching" } | { state: "done"; results: Result[] } | { state: "unavailable" };

// The index marks matches as <mark>…</mark> inside plain text. Splitting on
// the tag and building elements keeps every result as text: nothing from the
// index is ever parsed as HTML.
function highlighted(content: string): ReactNode[] {
  return content.split(/(<mark>.*?<\/mark>)/g).filter(Boolean).map((part, index) =>
    part.startsWith("<mark>") ? <mark key={index}>{part.slice(6, -7)}</mark> : part.replace(/<[^>]+>/g, ""),
  );
}

/** components.md, Docs page tree and Docs search. */
export function DocsNav({ items }: { items: DocsNavItem[] }) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<Search>({ state: "idle" });
  const [treeOpen, setTreeOpen] = useState(false);
  const needle = query.trim();

  useEffect(() => {
    if (!needle) return;
    let live = true;
    // A short pause so the index is asked once per word, not once per key.
    const timer = setTimeout(() => {
      setSearch({ state: "searching" });
      fetch(`/api/docs/search?query=${encodeURIComponent(needle)}`)
        .then((response) => {
          if (!response.ok) throw new Error(`search answered ${response.status}`);
          return response.json() as Promise<Result[]>;
        })
        .then((results) => { if (live) setSearch({ state: "done", results }); })
        .catch(() => { if (live) setSearch({ state: "unavailable" }); });
    }, 180);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [needle]);

  const tree = (
    <ol className={styles.tree}>
      {items.map((item, index) =>
        item.kind === "separator" ? (
          <li key={`separator-${index}`} className={styles.treeSeparator}>{item.name}</li>
        ) : (
          <li key={item.url}>
            <Link href={item.url} aria-current={pathname === item.url ? "page" : undefined} onClick={() => setTreeOpen(false)}>{item.name}</Link>
          </li>
        ),
      )}
    </ol>
  );

  const results = !needle ? null : search.state === "done" && search.results.length > 0 ? (
    <ol className={styles.results} aria-label="Search results">
      {search.results.map((result) => (
        <li key={result.id} data-type={result.type}>
          <Link href={result.url} onClick={() => setQuery("")}>{highlighted(result.content)}</Link>
        </li>
      ))}
    </ol>
  ) : (
    <p className={styles.searchState} role="status">
      {search.state === "unavailable"
        ? "Search could not be reached. The pages below are still here."
        : search.state === "done"
          ? `Nothing in the docs matches "${needle}". Try a shorter word.`
          : `Searching the docs for "${needle}".`}
    </p>
  );

  return (
    <nav className={styles.nav} aria-label="Docs">
      <label className={styles.search}>
        <Icon name="search" />
        <input
          type="search"
          value={query}
          placeholder="Search the docs"
          aria-label="Search the docs"
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Escape") setQuery(""); }}
        />
      </label>
      {results}
      {/* One tree for every width. On a phone it folds behind this button,
          which the stylesheet hides on wide layouts where the tree stays open. */}
      <button type="button" className={styles.treeToggle} aria-expanded={treeOpen} aria-controls="docs-tree" onClick={() => setTreeOpen((open) => !open)}>
        <span>Docs pages</span>
        <Icon name={treeOpen ? "close" : "next"} />
      </button>
      <div id="docs-tree" className={styles.treeHolder} data-open={treeOpen || undefined} hidden={Boolean(needle)}>
        {tree}
      </div>
    </nav>
  );
}
