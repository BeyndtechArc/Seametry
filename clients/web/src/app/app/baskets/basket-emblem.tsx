import type { SVGProps } from "react";

type EmblemProps = SVGProps<SVGSVGElement> & { basketId: string };

function Nodes({ count = 6, radius = 17 }: { count?: number; radius?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => {
        const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
        const x = 24 + Math.cos(angle) * radius;
        const y = 24 + Math.sin(angle) * radius;
        return <circle key={index} cx={x} cy={y} r="2.7" fill="var(--sm-surface-sheet)" stroke="currentColor" strokeWidth="1.5" />;
      })}
    </>
  );
}

export function BasketEmblem({ basketId, ...props }: EmblemProps) {
  const common = {
    viewBox: "0 0 48 48",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  const accent = "var(--sm-accent-touchText)";

  switch (basketId) {
    case "prime-seven":
      return (
        <svg {...common} {...props}>
          <circle cx="24" cy="24" r="7.5" fill="var(--sm-surface-raised)" />
          <path d="M24 8v9M35.3 12.7l-6.2 7M40 24h-9M35.3 35.3l-6.3-6.2M24 40v-9M12.7 35.3l6.2-6.2M8 24h9M12.7 12.7l6.2 7" />
          <Nodes count={8} radius={16} />
          <circle cx="24" cy="24" r="3.2" fill={accent} stroke="none" />
        </svg>
      );
    case "ai-cloud":
      return (
        <svg {...common} {...props}>
          <path d="M14 30h20a7 7 0 0 0 1-13.9 9 9 0 0 0-16.7-3.2A7.5 7.5 0 0 0 14 30Z" />
          <rect x="18" y="20" width="12" height="10" rx="1.5" fill="var(--sm-surface-raised)" />
          <path d="M21 17v3M27 17v3M21 30v3M27 30v3M15 23h3M30 23h3M15 27h3M30 27h3" />
          <rect x="21" y="22.5" width="6" height="5" fill={accent} stroke="none" />
        </svg>
      );
    case "compute-chain":
      return (
        <svg {...common} {...props}>
          <rect x="17" y="17" width="14" height="14" rx="2" fill="var(--sm-surface-raised)" />
          <rect x="21" y="21" width="6" height="6" fill={accent} stroke="none" />
          <path d="M24 8v9M24 31v9M8 24h9M31 24h9M13 13l6.5 6.5M35 13l-6.5 6.5M13 35l6.5-6.5M35 35l-6.5-6.5" />
          <Nodes count={8} radius={17} />
        </svg>
      );
    case "physical-ai":
      return (
        <svg {...common} {...props}>
          <circle cx="24" cy="24" r="6.5" fill="var(--sm-surface-raised)" />
          <path d="M24 9a15 15 0 0 1 13 7.5M39 24a15 15 0 0 1-7.5 13M24 39a15 15 0 0 1-13-7.5M9 24a15 15 0 0 1 7.5-13" />
          <circle cx="24" cy="24" r="2.7" fill={accent} stroke="none" />
          <path d="M24 17.5v-4M30.5 24h4M24 30.5v4M17.5 24h-4" />
        </svg>
      );
    case "defense-autonomy":
      return (
        <svg {...common} {...props}>
          <path d="M24 8 36 13v9c0 8-5 13-12 18-7-5-12-10-12-18v-9L24 8Z" fill="var(--sm-surface-raised)" />
          <circle cx="24" cy="23" r="6" />
          <circle cx="24" cy="23" r="2.5" fill={accent} stroke="none" />
          <path d="M24 14v3M33 23h-3M24 32v-3M15 23h3" />
        </svg>
      );
    case "attention-economy":
      return (
        <svg {...common} {...props}>
          <path d="M7 24c4.5-7 10-10.5 17-10.5S36.5 17 41 24c-4.5 7-10 10.5-17 10.5S11.5 31 7 24Z" />
          <circle cx="24" cy="24" r="6.5" fill="var(--sm-surface-raised)" />
          <circle cx="24" cy="24" r="2.7" fill={accent} stroke="none" />
          <path d="M24 8v3M24 37v3M8 14l3 2M37 32l3 2M8 34l3-2M37 16l3-2" />
        </svg>
      );
    case "digital-capital":
      return (
        <svg {...common} {...props}>
          <ellipse cx="24" cy="15" rx="10" ry="4.5" fill="var(--sm-surface-raised)" />
          <path d="M14 15v7c0 2.5 4.5 4.5 10 4.5S34 24.5 34 22v-7M14 22v7c0 2.5 4.5 4.5 10 4.5S34 31.5 34 29v-7" />
          <path d="M9 24a15 15 0 0 0 4.5 10.7M39 24a15 15 0 0 1-4.5 10.7" stroke={accent} />
        </svg>
      );
    case "global-rotation":
      return (
        <svg {...common} {...props}>
          <circle cx="24" cy="24" r="9" />
          <path d="M15 24h18M24 15c3 3 4.5 6 4.5 9S27 30 24 33M24 15c-3 3-4.5 6-4.5 9S21 30 24 33" />
          <path d="M10 16a16 16 0 0 1 20-6M38 15l-8-5 2-4M38 32a16 16 0 0 1-20 6M10 33l8 5-2 4" stroke={accent} />
        </svg>
      );
    case "cloud-core":
      return (
        <svg {...common} {...props}>
          <path d="M14 29h20a7 7 0 0 0 1-13.8 9.5 9.5 0 0 0-17-2.4A7.5 7.5 0 0 0 14 29Z" />
          <ellipse cx="24" cy="23" rx="6.5" ry="2.8" fill="var(--sm-surface-raised)" />
          <path d="M17.5 23v7c0 1.5 3 2.8 6.5 2.8s6.5-1.3 6.5-2.8v-7M17.5 27c0 1.5 3 2.8 6.5 2.8s6.5-1.3 6.5-2.8" />
          <circle cx="24" cy="23" r="1.7" fill={accent} stroke="none" />
        </svg>
      );
    case "private-frontier":
      return (
        <svg {...common} {...props}>
          <path d="M10 31 24 11l14 20-14 6-14-6Z" fill="var(--sm-surface-raised)" />
          <path d="M24 11v26M10 31l14-8 14 8" />
          <circle cx="24" cy="11" r="2.2" fill={accent} stroke="none" />
          <circle cx="10" cy="31" r="2.2" fill={accent} stroke="none" />
          <circle cx="38" cy="31" r="2.2" fill={accent} stroke="none" />
        </svg>
      );
    default:
      return (
        <svg {...common} {...props}>
          <circle cx="24" cy="24" r="13" />
          <Nodes count={6} radius={16} />
          <circle cx="24" cy="24" r="4" fill={accent} stroke="none" />
        </svg>
      );
  }
}
