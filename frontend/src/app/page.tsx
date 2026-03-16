"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useState } from "react";

type User = {
  id: number;
  spotify_id: string;
  display_name: string | null;
};

export default function Home() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      try {
        const response = await fetch(`${apiUrl}/auth/me`, {
          credentials: "include",
        });
        const data = await response.json();
        if (!cancelled) {
          setUser(data.user || null);
          setAuthChecked(true);
        }
      } catch (err) {
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

  async function handleLogout() {
    await fetch(`${apiUrl}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    setUser(null);
  }

  return (
    <div className="min-h-screen text-[color:var(--foreground)]">
      <div className="relative overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.18),_rgba(8,10,12,0.9)_55%)]">
        <div className="pointer-events-none absolute left-0 top-0 h-full w-full bg-[linear-gradient(135deg,_rgba(255,255,255,0.04),_transparent_40%)]" />
        <header className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
          <div className="flex flex-wrap items-center justify-between gap-6 border-b border-[color:var(--border)] pb-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-none bg-[color:var(--accent)] text-lg font-bold text-[#0a140c]">
                J
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-[var(--muted)]">
                  Jukebox
                </p>
                <p className="font-mono text-xl font-semibold tracking-tight">
                  Album diary for music obsessives
                </p>
              </div>
            </div>
            <nav className="flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
              <span className="rounded-none border border-[color:var(--border)] px-4 py-2 text-[var(--foreground)]">
                Home
              </span>
              <Link
                href="/search"
                className="rounded-none border border-[color:var(--border)] px-4 py-2 text-[var(--foreground)] transition hover:border-[var(--accent)]"
              >
                Search
              </Link>
              <Link
                href="/profile"
                className="rounded-none border border-[color:var(--border)] px-4 py-2 text-[var(--foreground)] transition hover:border-[var(--accent)]"
              >
                Profile
              </Link>
            </nav>
            <div className="flex flex-wrap items-center gap-3">
              {!authChecked && (
                <span className="text-xs text-[var(--muted)]">
                  Checking session...
                </span>
              )}
              {user ? (
                <>
                  <span className="text-sm text-[var(--muted)]">
                    Signed in as{" "}
                    <span className="font-semibold text-[var(--foreground)]">
                      {user.display_name || user.spotify_id}
                    </span>
                  </span>
                  <button
                    className="rounded-none border border-[color:var(--border)] px-4 py-2 text-sm text-[var(--foreground)] transition hover:border-[var(--accent)]"
                    onClick={handleLogout}
                  >
                    Log out
                  </button>
                </>
              ) : (
                <a
                  className="inline-flex items-center justify-center rounded-none bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[#0a140c] transition hover:bg-[var(--accent-strong)]"
                  href={`${apiUrl}/auth/spotify`}
                >
                  Continue with Spotify
                </a>
              )}
            </div>
          </div>

          <div className="grid gap-8 md:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <p className="text-xs uppercase tracking-[0.4em] text-[var(--muted-strong)]">
                Your listening ledger
              </p>
              <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
                Track, rate, and review the albums you live for.
              </h1>
              <p className="max-w-xl text-sm text-[var(--muted)]">
                Build a living diary of the records that shaped your year. Save
                ratings, write reviews, and curate ranked lists that say more
                than a playlist ever could.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {!user && (
                  <a
                    className="rounded-none bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[#0a140c] transition hover:bg-[var(--accent-strong)]"
                    href={`${apiUrl}/auth/spotify`}
                  >
                    Continue with Spotify
                  </a>
                )}
                <Link
                  className="rounded-none border border-[color:var(--border)] px-6 py-3 text-sm text-[var(--foreground)] transition hover:border-[var(--accent)]"
                  href="/search"
                >
                  Explore albums
                </Link>
              </div>
            </div>
            <div className="grid gap-4">
              <div className="border border-[color:var(--border)] bg-[color:var(--surface-strong)] p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted-strong)]">
                  Featured
                </p>
                <p className="mt-2 text-sm text-[var(--foreground)]">
                  Jukebox works like a music Letterboxd. Log listens, pin your
                  favorites, and show the world your top three.
                </p>
              </div>
              <div className="border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted-strong)]">
                  Discover
                </p>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Search Spotify without signing in. Log in when you are ready
                  to rate and review.
                </p>
              </div>
            </div>
          </div>
        </header>
      </div>

      <main className="mx-auto w-full max-w-6xl space-y-12 px-6 py-12">
        <section className="grid gap-4 md:grid-cols-3">
          {[
            {
              title: "Log your listens",
              description:
                "Rate albums from 1 to 10 and build a personal listening history.",
            },
            {
              title: "Curate ranked lists",
              description:
                "Drag and drop to order your favorite records in ranked lists.",
            },
            {
              title: "Pin your top reviews",
              description:
                "Showcase the reviews that define your taste on your profile.",
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="border border-[color:var(--border)] bg-[color:var(--surface)] p-5"
            >
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted-strong)]">
                {feature.title}
              </p>
              <p className="mt-3 text-sm text-[var(--muted)]">
                {feature.description}
              </p>
            </div>
          ))}
        </section>

        <section className="border border-[color:var(--border)] bg-[color:var(--surface-strong)] p-6 text-sm text-[var(--muted)]">
          Follow other listeners, trade recommendations, and build your music
          canon together.
        </section>

        <section className="flex flex-wrap items-center justify-between gap-4 border-t border-[color:var(--border)] pt-6 text-xs text-[var(--muted)]">
          <span>Jukebox · Built for album people</span>
          <div className="flex items-center gap-4 text-[10px] uppercase tracking-[0.3em]">
            <span>About</span>
            <span>Privacy</span>
            <span>Support</span>
          </div>
        </section>
      </main>
    </div>
  );
}
