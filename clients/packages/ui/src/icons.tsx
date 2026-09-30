import type { SVGProps } from "react";

export type IconName =
  | "arrow-up-right"
  | "assay"
  | "buy"
  | "desk"
  | "hall"
  | "key"
  | "moon"
  | "read"
  | "sun"
  | "wallet";

export function Icon({ name, ...svgProps }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      {...svgProps}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
    >
      {name === "arrow-up-right" ? <><path d="M7 17 17 7" /><path d="M8 7h9v9" /></> : null}
      {name === "assay" ? <><path d="M9 3h6" /><path d="M10 3v6l-5 8.5A2.3 2.3 0 0 0 7 21h10a2.3 2.3 0 0 0 2-3.5L14 9V3" /><path d="M7.5 16h9" /></> : null}
      {name === "buy" ? <><path d="M4 6h16v13H4z" /><path d="M4 10h16" /><path d="M15 15h2" /></> : null}
      {name === "desk" ? <><path d="M4 4h16v16H4z" /><path d="M4 10h16M10 10v10" /></> : null}
      {name === "hall" ? <><path d="M4 10 12 4l8 6" /><path d="M6 10v9h12v-9" /><path d="M9 19v-5h6v5" /></> : null}
      {name === "key" ? <><circle cx="8" cy="12" r="4" /><path d="M12 12h8M17 12v3M20 12v2" /></> : null}
      {name === "moon" ? <path d="M20 15.2A8 8 0 0 1 8.8 4a8.2 8.2 0 1 0 11.2 11.2Z" /> : null}
      {name === "read" ? <><path d="M4 5.5A8 8 0 0 1 12 7v13a8 8 0 0 0-8-1.5Z" /><path d="M20 5.5A8 8 0 0 0 12 7v13a8 8 0 0 1 8-1.5Z" /></> : null}
      {name === "sun" ? <><circle cx="12" cy="12" r="3.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></> : null}
      {name === "wallet" ? <><path d="M4 6h14a2 2 0 0 1 2 2v11H4z" /><path d="M4 6V5a2 2 0 0 1 2-2h11v3" /><path d="M15 12h5v4h-5a2 2 0 0 1 0-4Z" /></> : null}
    </svg>
  );
}
