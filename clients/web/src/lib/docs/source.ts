import { defineDocs } from "fumadocs-mdx/macro";
import { loader } from "fumadocs-core/source";

// The directory is relative to clients/web and must be a string literal: the
// macro reads it at build time, not at run time. MDX options, including code
// highlighting being off, are global in clients/web/source.config.ts.
const docs = defineDocs({ dir: "content/docs" });

export const source = loader({ baseUrl: "/docs", source: docs.toFumadocsSource() });
