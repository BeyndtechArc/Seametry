import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { source } from "@/lib/docs/source";
import { mdxComponents } from "../mdx-components";
import styles from "../docs.module.css";

type Params = { params: Promise<{ slug?: string[] }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const page = source.getPage((await params).slug);
  if (!page) return {};
  return { title: `${page.data.title} | Seametry docs`, description: page.data.description };
}

export default async function DocsPage({ params }: Params) {
  await connection();
  const page = source.getPage((await params).slug);
  if (!page) notFound();
  const Body = page.data.body;
  const toc = page.data.toc;

  return (
    <div className={styles.reading}>
      <article className={styles.page}>
        <header className={styles.head}>
          <h1>{page.data.title}</h1>
          {page.data.description ? <p>{page.data.description}</p> : null}
        </header>
        <div className={styles.prose}>
          <Body components={mdxComponents} />
        </div>
      </article>
      {/* components.md, Docs contents rail: present only when there are two or more headings to move between. */}
      {toc.length >= 2 ? (
        <nav className={styles.contents} aria-label="On this page">
          <span>On this page</span>
          <ol>
            {toc.map((item) => (
              <li key={item.url} data-depth={item.depth}>
                <a href={item.url}>{item.title}</a>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
    </div>
  );
}
