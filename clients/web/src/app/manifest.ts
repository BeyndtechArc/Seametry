import type { MetadataRoute } from "next";
import { theme } from "@seametry/ui/tokens";

// Opening from the home screen lands on Allocation, the consumer app's first
// screen, in its own frame without the browser's bars.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Seametry",
    short_name: "Seametry",
    description: "Know what it's made of.",
    start_url: "/app/allocation",
    scope: "/",
    display: "standalone",
    background_color: theme.light.surface.ground,
    theme_color: theme.light.surface.ground,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
