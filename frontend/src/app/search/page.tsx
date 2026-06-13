"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/Shell";
import { SectionHead } from "@/components/SectionHead";
import { AlbumCover } from "@/components/AlbumCover";

type User = {
  id: number;
  spotify_id: string;
  display_name: string | null;
};

type AlbumSummary = {
  id: string;
  name: string;
  artists: string[];
  image: string | null;
  release_date: string;
  total_tracks: number;
};

export default function SearchPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AlbumSummary[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const canSearch = useMemo(() => query.trim().length > 1, [query]);

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

  async function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!canSearch) {
      setResults([]);
      return;
    }

    setLoadingSearch(true);
    setSearched(true);
    try {
      const response = await fetch(
        `${apiUrl}/spotify/search?query=${encodeURIComponent(query.trim())}`,
        { credentials: "include" }
      );
      if (!response.ok) {
        setError("Search failed. Try again.");
        setResults([]);
        return;
      }
      const data = await response.json();
      setResults(data.albums || []);
    } catch {
      setError("Search failed. Try again.");
    } finally {
      setLoadingSearch(false);
    }
  }

  async function handleLogout() {
    await fetch(`${apiUrl}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    setUser(null);
  }

  return (
    <Shell user={user} onLogout={handleLogout}>
      <main style={{ maxWidth: 1320, margin: "0 auto", padding: "0 40px" }}>
        {/* ══════════ HERO ══════════ */}
        <section style={{ padding: "56px 0 40px" }}>
          <div className="eyebrow" style={{ marginBottom: 18 }}>
            The catalog
          </div>
          <h1
            className="display"
            style={{ fontSize: "clamp(48px, 6vw, 88px)", margin: 0, maxWidth: 880 }}
          >
            Find the record, then <em>have your say.</em>
          </h1>
          <p className="pull" style={{ fontSize: 22, marginTop: 24, maxWidth: 520 }}>
            Search any album in the Spotify catalog.{" "}
            {authChecked && !user
              ? "Sign in to rate and review what you find."
              : "Open one to rate it, review it, or add it to a list."}
          </p>

          {/* search form */}
          <form
            onSubmit={handleSearch}
            className="search-field"
            style={{ marginTop: 28, maxWidth: 640 }}
          >
            <input
              placeholder="Search for an album or artist"
              aria-label="Search for an album or artist"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button type="submit" disabled={!canSearch || loadingSearch}>
              {loadingSearch ? (
                "Searching…"
              ) : (
                <>
                  Search
                  <span aria-hidden="true">→</span>
                </>
              )}
            </button>
          </form>
          {!canSearch && query.trim().length > 0 && (
            <div className="eyebrow" style={{ marginTop: 10 }}>
              Type at least two characters
            </div>
          )}
        </section>

        {/* ══════════ RESULTS ══════════ */}
        <section style={{ padding: "48px 0", borderTop: "1px solid var(--ink)" }}>
          <SectionHead
            title="Results"
            emph="Results"
            count={
              loadingSearch
                ? "Searching…"
                : results.length > 0
                  ? `${results.length} album${results.length === 1 ? "" : "s"}`
                  : ""
            }
          />

          {error && (
            <div className="note" style={{ marginBottom: 20 }} role="alert">
              {error}
            </div>
          )}

          {loadingSearch && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 16,
              }}
            >
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} aria-hidden="true">
                  <div
                    style={{
                      aspectRatio: "1/1",
                      background: "var(--bg-strong)",
                    }}
                  />
                  <div
                    style={{
                      height: 12,
                      width: "70%",
                      background: "var(--bg-strong)",
                      marginTop: 12,
                    }}
                  />
                  <div
                    style={{
                      height: 10,
                      width: "45%",
                      background: "var(--bg-strong)",
                      marginTop: 8,
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {!loadingSearch && !error && results.length === 0 && (
            <p className="pull" style={{ fontSize: 20, color: "var(--muted)" }}>
              {searched
                ? "No albums matched that search. Try another title or artist."
                : "Start by searching for an album or artist above."}
            </p>
          )}

          {!loadingSearch && results.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 16,
              }}
            >
              {results.map((album) => (
                <Link key={album.id} href={`/albums/${album.id}`}>
                  <AlbumCover src={album.image} alt={`${album.name} cover`} />
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      {album.name}
                    </div>
                    <div className="eyebrow" style={{ marginTop: 2 }}>
                      {album.artists.join(", ")}
                    </div>
                    <div
                      className="eyebrow"
                      style={{ marginTop: 6, color: "var(--muted-2)" }}
                    >
                      {album.release_date
                        ? album.release_date.slice(0, 4)
                        : "—"}{" "}
                      · {album.total_tracks} track
                      {album.total_tracks === 1 ? "" : "s"}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </Shell>
  );
}
