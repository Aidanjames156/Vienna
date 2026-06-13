import * as React from "react";
import Link from "next/link";

type SectionHeadProps = {
  /** Big display-serif title. Wrap italic portions in <em> or pass `emph`. */
  title: React.ReactNode;
  /** Shortcut: wraps `emph` in italic accent inside the title. */
  emph?: string;
  /** Small mono caption on the right-of-title. */
  count?: React.ReactNode;
  /** Optional "more →" link on the far right. */
  moreHref?: string;
  moreLabel?: string;
  className?: string;
};

/**
 * Editorial section head: big italic-display title, mono caption, "more →" link.
 * Renders a 3-column grid. Omit `count` or `moreHref` to collapse that column.
 */
export function SectionHead({
  title,
  emph,
  count,
  moreHref,
  moreLabel = "See all →",
  className = "",
}: SectionHeadProps) {
  // If caller passed `emph`, wrap the first matching substring inside the title in <em>.
  let renderedTitle: React.ReactNode = title;
  if (typeof title === "string" && emph && title.includes(emph)) {
    const [before, after] = title.split(emph);
    renderedTitle = (
      <>
        {before}
        <em>{emph}</em>
        {after}
      </>
    );
  }

  return (
    <div
      className={`section-head ${className}`}
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: 20,
        alignItems: "baseline",
        marginBottom: 32,
      }}
    >
      <h2
        className="display"
        style={{ fontSize: 44, lineHeight: 1, margin: 0 }}
      >
        {renderedTitle}
      </h2>
      <div
        className="eyebrow"
        style={{ borderTop: "1px solid var(--line)", paddingTop: 6 }}
      >
        {count || ""}
      </div>
      {moreHref ? (
        <Link
          href={moreHref}
          className="eyebrow"
          style={{ borderBottom: "1px solid var(--ink)", paddingBottom: 2, color: "var(--ink)" }}
        >
          {moreLabel}
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}
