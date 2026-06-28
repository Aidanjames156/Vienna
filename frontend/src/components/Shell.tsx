"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type User = {
  id: number;
  spotify_id: string;
  display_name: string | null;
};

type ShellProps = {
  /** Current signed-in user (or null). Drives the "@handle · N reviews" masthead meta. */
  user?: User | null;
  /** Optional review count / follower count to fill the masthead right-side meta. */
  reviewCount?: number;
  followerCount?: number;
  /** Issue number shown on masthead left. Defaults to a week-based number. */
  issueNumber?: number;
  /** Renders a "Log out" tool in the tab bar when provided and a user is signed in. */
  onLogout?: () => void;
  children: React.ReactNode;
};

type TabDef = { href: string; label: string; num: string; matches?: (p: string) => boolean };

const TABS: TabDef[] = [
  { href: "/", label: "Home", num: "01", matches: (p) => p === "/" },
  { href: "/search", label: "Search", num: "02", matches: (p) => p.startsWith("/search") || p.startsWith("/albums") || p.startsWith("/lists") },
  { href: "/profile", label: "Profile", num: "03", matches: (p) => p.startsWith("/profile") },
];

function formatDateLine() {
  const d = new Date();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function Shell({
  user,
  reviewCount,
  followerCount,
  issueNumber,
  onLogout,
  children,
}: ShellProps) {
  const pathname = usePathname() || "/";

  // Derive issue # from the ISO week of the year if not provided.
  const issue =
    issueNumber ??
    (() => {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      const diff = (now.getTime() - start.getTime()) / 86400000;
      return Math.floor((diff + start.getDay()) / 7) + 1;
    })();

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";

  const handle = user ? `@${user.display_name || user.spotify_id}` : "@guest";
  const metaRight =
    user && typeof reviewCount === "number"
      ? `${handle} · ${reviewCount} reviews${
          typeof followerCount === "number" ? ` · ${followerCount} followers` : ""
        }`
      : user
        ? handle
        : "Sign in to log reviews";

  const toolStyle: React.CSSProperties = {
    padding: "14px 22px",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--ink-2)",
    borderRight: "1px solid var(--line)",
    background: "none",
    border: "0 solid var(--line)",
    borderRightWidth: 1,
    cursor: "pointer",
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--ink)" }}>
      {/* ── masthead ── */}
      <header style={{ borderBottom: "1px solid var(--ink)", background: "var(--bg)" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", padding: "0 40px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto 1fr",
              alignItems: "center",
              padding: "18px 0 14px",
              gap: 20,
            }}
          >
            <div className="eyebrow">
              Issue № {issue} · <b style={{ color: "var(--ink)", fontWeight: 500 }}>Week of {formatDateLine()}</b>
            </div>
            <Link
              href="/"
              style={{
                fontFamily: "var(--font-display-serif), serif",
                fontSize: 44,
                fontStyle: "italic",
                lineHeight: 1,
                letterSpacing: "-0.01em",
                textAlign: "center",
                color: "var(--ink)",
              }}
            >
              Jukebox
            </Link>
            <div className="eyebrow" style={{ textAlign: "right" }}>
              {user ? (
                <b style={{ color: "var(--ink)", fontWeight: 500 }}>{metaRight}</b>
              ) : (
                <a
                  href={`${apiUrl}/auth/spotify`}
                  style={{
                    color: "var(--ink)",
                    fontWeight: 500,
                    borderBottom: "1px solid var(--ink)",
                    cursor: "pointer",
                  }}
                >
                  {metaRight}
                </a>
              )}
            </div>
          </div>
        </div>

        {/* ── tab bar ── */}
        <div style={{ maxWidth: 1320, margin: "0 auto", padding: "0 40px" }}>
          <nav
            aria-label="Primary"
            style={{
              display: "flex",
              borderBottom: "1px solid var(--ink)",
              background: "var(--bg)",
            }}
          >
            {TABS.map((tab, i) => {
              const active = tab.matches ? tab.matches(pathname) : pathname === tab.href;
              return (
                <Link
                  key={tab.label}
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  style={{
                    padding: "14px 22px",
                    fontSize: 13,
                    fontWeight: 500,
                    letterSpacing: "0.02em",
                    color: active ? "var(--paper)" : "var(--ink-2)",
                    background: active ? "var(--ink)" : "transparent",
                    borderRight: "1px solid var(--line)",
                    borderLeft: i === 0 ? "1px solid var(--line)" : undefined,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {tab.label}{" "}
                  <span
                    style={{
                      fontFamily: "var(--font-mono-code), monospace",
                      fontSize: 10,
                      color: active ? "rgba(255,255,255,0.55)" : "var(--muted-2)",
                    }}
                  >
                    {tab.num}
                  </span>
                </Link>
              );
            })}
            <div style={{ flex: 1 }} />
            {user && onLogout && (
              <div style={{ display: "flex", borderLeft: "1px solid var(--line)" }}>
                <button type="button" onClick={onLogout} style={{ ...toolStyle, borderRightWidth: 0 }}>
                  Log out
                </button>
              </div>
            )}
          </nav>
        </div>
      </header>

      {children}

      <footer
        style={{
          borderTop: "1px solid var(--ink)",
          marginTop: 80,
          padding: "40px 0 60px",
        }}
      >
        <div
          style={{
            maxWidth: 1320,
            margin: "0 auto",
            padding: "0 40px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 40,
          }}
          className="eyebrow"
        >
          <div
            style={{
              fontFamily: "var(--font-display-serif), serif",
              fontStyle: "italic",
              fontSize: 32,
              color: "var(--ink)",
              letterSpacing: "-0.01em",
              textTransform: "none",
            }}
          >
            Jukebox
          </div>
          <div>
            For music obsessives
            <br />
            Est. 2026
          </div>
          <div style={{ textAlign: "right" }}>
            <span>About</span> &nbsp; <span>Privacy</span> &nbsp; <span>Support</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
