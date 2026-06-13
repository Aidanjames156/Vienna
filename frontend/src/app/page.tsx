"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { SectionHead } from "@/components/SectionHead";
import { AlbumCover } from "@/components/AlbumCover";
import { Stars } from "@/components/Stars";

type User = {
  id: number;
  spotify_id: string;
  display_name: string | null;
};

type TrendingAlbum = {
  id: string;
  name: string;
  artists: string[];
  image: string | null;
  popularity?: number;
};

export default function Home() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [trending, setTrending] = useState<TrendingAlbum[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [trendingError, setTrendingError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadUser() {
      try {
        const response = await fetch(`${apiUrl}/auth/me`, { credentials: "include" });
        const data = await response.json();
        if (!cancelled) {
          setUser(data.user || null);
          setAuthChecked(true);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          setAuthChecked(true);
        }
      }
    }
    loadUser();
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  useEffect(() => {
    let cancelled = false;
    async function loadTrending() {
      setTrendingLoading(true);
      setTrendingError(null);
      try {
        const response = await fetch(`${apiUrl}/spotify/trending?limit=8`, {
          credentials: "include",
        });
        if (!response.ok) throw new Error("trending_failed");
        const data = await response.json();
        if (!cancelled) setTrending(Array.isArray(data.albums) ? data.albums : []);
      } catch {
        if (!cancelled) {
          setTrendingError("Could not load trending albums.");
          setTrending([]);
        }
      } finally {
        if (!cancelled) setTrendingLoading(false);
      }
    }
    loadTrending();
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  async function handleLogout() {
    await fetch(`${apiUrl}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    setUser(null);
  }

  // Derive hero (pick of the week) + trending tail
  const pick = trending[0];
  const trendingTail = trending.slice(1, 8);

  return (
    <Shell user={user} onLogout={handleLogout}>
      <main style={{ maxWidth: 1320, margin: "0 auto", padding: "0 40px" }}>
        {/* ══════════ HERO ══════════ */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1.1fr 1fr",
            gap: 48,
            padding: "56px 0 64px",
            alignItems: "center",
          }}
        >
          <div>
            <div className="eyebrow" style={{ marginBottom: 18 }}>
              This week in listening
            </div>
            <h1
              className="display"
              style={{
                fontSize: "clamp(56px, 7vw, 104px)",
                margin: 0,
              }}
            >
              Track, rate
              <br />& <em>review</em> the
              <br />
              music you
              <br />
              live for.
            </h1>
            <p className="pull" style={{ fontSize: 22, marginTop: 28, maxWidth: 480 }}>
              A living diary of the records that shaped your year. Save
              ratings, write reviews, curate ranked lists.
            </p>
            <div style={{ display: "flex", gap: 20, marginTop: 28, alignItems: "center" }}>
              {!authChecked ? null : user ? (
                <>
                  <Link href="/search" className="btn primary" style={{ gap: 8 }}>
                    Log a listen
                    <span aria-hidden="true">→</span>
                  </Link>
                  <Link href="/profile" className="quiet-link">
                    Your profile
                    <span aria-hidden="true">→</span>
                  </Link>
                </>
              ) : (
                <>
                  <a className="btn primary" href={`${apiUrl}/auth/spotify`} style={{ gap: 8 }}>
                    Continue with Spotify
                    <span aria-hidden="true">→</span>
                  </a>
                  <Link href="/search" className="quiet-link">
                    Explore albums
                    <span aria-hidden="true">→</span>
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* pick of the week — first trending album, bleeding tabloid-style */}
          <div>
            {pick ? (
              <Link href={`/albums/${pick.id}`}>
                <AlbumCover src={pick.image} alt={`${pick.name} cover`}>
                  <div
                    style={{
                      position: "absolute",
                      top: 20,
                      right: 20,
                      background: "var(--paper)",
                      color: "var(--ink)",
                      padding: "6px 10px",
                    }}
                    className="eyebrow"
                  >
                    Pick of the week
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      left: 20,
                      bottom: 20,
                      color: "#ffffff",
                      background: "rgba(0,0,0,0.45)",
                      padding: "6px 10px",
                      backdropFilter: "blur(6px)",
                    }}
                    className="eyebrow"
                  >
                    {pick.name} — {pick.artists.join(", ")}
                  </div>
                </AlbumCover>
              </Link>
            ) : (
              <AlbumCover src={null} alt="Loading pick of the week" />
            )}
          </div>
        </section>

        {/* ══════════ TRENDING ══════════ */}
        <section style={{ padding: "48px 0", borderTop: "1px solid var(--ink)" }}>
          <SectionHead
            title="Trending now"
            emph="now"
            count="Updated every 15 min"
            moreHref="/search"
            moreLabel="Explore →"
          />

          {trendingLoading && (
            <div
              className="eyebrow"
              style={{ padding: "24px 0", color: "var(--muted)" }}
            >
              Loading trending albums…
            </div>
          )}

          {trendingError && (
            <div
              style={{
                border: "1px solid var(--line)",
                background: "var(--bg-strong)",
                padding: 16,
                color: "var(--ink-2)",
                fontSize: 13,
              }}
              role="alert"
            >
              {trendingError}
            </div>
          )}

          {!trendingLoading && !trendingError && trendingTail.length === 0 && !pick && (
            <div
              className="eyebrow"
              style={{ padding: "24px 0", color: "var(--muted)" }}
            >
              No trending albums available right now.
            </div>
          )}

          {!trendingLoading && trendingTail.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: 16,
              }}
            >
              {trendingTail.map((album, i) => (
                <Link key={album.id} href={`/albums/${album.id}`}>
                  <AlbumCover src={album.image} alt={`${album.name} cover`} />
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>
                      {album.name}
                    </div>
                    <div className="eyebrow" style={{ marginTop: 2 }}>
                      #{i + 2} · {album.artists.join(", ")}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* ══════════ FEATURE TILES (secondary) ══════════ */}
        <section style={{ padding: "48px 0", borderTop: "1px solid var(--ink)" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 40,
            }}
          >
            {[
              {
                kicker: "Log your listens",
                body:
                  "Rate albums from 1 to 10 and build a personal listening history.",
              },
              {
                kicker: "Curate ranked lists",
                body: "Order your favorite records in ranked lists.",
              },
              {
                kicker: "Pin your top reviews",
                body:
                  "Showcase the reviews that define your taste on your profile.",
              },
            ].map((f) => (
              <div
                key={f.kicker}
                style={{
                  borderTop: "1px solid var(--line-strong)",
                  paddingTop: 18,
                }}
              >
                <div className="eyebrow" style={{ color: "var(--muted-strong)" }}>
                  {f.kicker}
                </div>
                <p
                  className="pull"
                  style={{
                    fontSize: 22,
                    marginTop: 12,
                    color: "var(--ink)",
                  }}
                >
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════ FEATURED (pick of the week, editorial treatment) ══════════ */}
        <section style={{ padding: "48px 0", borderTop: "1px solid var(--ink)" }}>
          <SectionHead
            title="Featured review"
            emph="review"
            count={pick ? `Top of this week · ${pick.artists.join(", ")}` : ""}
          />
          {pick && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "200px 1fr",
                gap: 24,
                paddingTop: 8,
              }}
            >
              <AlbumCover src={pick.image} alt={`${pick.name} cover`} />
              <div>
                <p
                  className="pull"
                  style={{ fontSize: 26, color: "var(--ink)" }}
                >
                  &ldquo;The record of the week. A slow, cavernous listen that
                  keeps revealing itself.&rdquo;
                </p>
                <div
                  className="eyebrow"
                  style={{
                    marginTop: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span>@jukebox · editorial</span>
                  <span
                    style={{
                      width: 3,
                      height: 3,
                      background: "var(--muted)",
                    }}
                  />
                  <span>
                    {pick.name} — {pick.artists.join(", ")}
                  </span>
                  <span
                    style={{
                      width: 3,
                      height: 3,
                      background: "var(--muted)",
                    }}
                  />
                  <Stars value={4.5} />
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </Shell>
  );
}
