import * as React from "react";

type StarsProps = {
  /** 0..5 (half-steps supported) */
  value: number;
  size?: number;
  className?: string;
};

/**
 * Half-step star rating. Stroked when empty, filled when full, clipped when
 * partial. `currentColor` so parents control the tone.
 */
export function Stars({ value, size = 14, className }: StarsProps) {
  const clamped = Math.max(0, Math.min(5, value));
  const idBase = React.useId();

  return (
    <span
      className={className}
      style={{ display: "inline-flex", gap: 1, alignItems: "center", color: "var(--ink)" }}
      aria-label={`Rated ${clamped} out of 5`}
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const fill = Math.max(0, Math.min(1, clamped - i));
        const clipId = `${idBase}-s${i}`.replace(/:/g, "");
        return (
          <svg
            key={i}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            aria-hidden
            style={{ display: "block" }}
          >
            <defs>
              <clipPath id={clipId}>
                <rect x="0" y="0" width={24 * fill} height="24" />
              </clipPath>
            </defs>
            <path
              d="M12 2.3 L14.6 9 L21.8 9.4 L16.2 13.9 L18.1 20.8 L12 16.9 L5.9 20.8 L7.8 13.9 L2.2 9.4 L9.4 9 Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            <path
              clipPath={`url(#${clipId})`}
              d="M12 2.3 L14.6 9 L21.8 9.4 L16.2 13.9 L18.1 20.8 L12 16.9 L5.9 20.8 L7.8 13.9 L2.2 9.4 L9.4 9 Z"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
        );
      })}
    </span>
  );
}

/** Convert a 1–10 integer rating to a 0..5 star value. */
export function rating10ToStars(rating: number) {
  return rating / 2;
}
