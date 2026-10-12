import { createFromSource } from "fumadocs-core/search/server";
import { source } from "@/lib/docs/source";

// The index is built from the compiled pages inside this deployment, so a
// query never reaches a third-party search service.
export const { GET } = createFromSource(source, { language: "english" });
