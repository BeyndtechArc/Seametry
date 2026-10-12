import { defineConfig } from "fumadocs-mdx/config";

// Code highlighting off for every docs page. The highlighter colours tokens
// with inline style attributes, which the nonce policy in src/proxy.ts
// refuses; code blocks take the house's digest face instead. Set here rather
// than on defineDocs in src/lib/docs/source.ts: the macro reads that call
// statically and ignored an mdxOptions passed as a function call.
export default defineConfig({
  mdxOptions: { rehypeCodeOptions: false },
});
