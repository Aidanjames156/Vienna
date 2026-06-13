/* eslint-disable @next/next/no-img-element */
import * as React from "react";

type AlbumCoverProps = {
  src?: string | null;
  alt: string;
  /** CSS aspect ratio, e.g. "1/1", "4/3". Default 1/1. */
  ratio?: string;
  className?: string;
  /** Fallback hue when no art is present; derived from `alt` if omitted. */
  fallbackColor?: string;
  /** Overlay content pinned to the cover (badges, rank numbers, etc). */
  children?: React.ReactNode;
};

function hueFromString(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return `oklch(0.55 0.09 ${hue})`;
}

/**
 * Square-by-default album cover with graceful fallback. Always hard-edged
 * (no border-radius), always bleeds flush. Children render over the image.
 */
export function AlbumCover({
  src,
  alt,
  ratio = "1/1",
  className = "",
  fallbackColor,
  children,
}: AlbumCoverProps) {
  const bg = fallbackColor || hueFromString(alt);
  return (
    <div
      className={className}
      style={{
        position: "relative",
        aspectRatio: ratio,
        width: "100%",
        overflow: "hidden",
        background: bg,
      }}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : (
        <div
          className="eyebrow"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,0.7)",
          }}
        >
          No art
        </div>
      )}
      {children}
    </div>
  );
}
