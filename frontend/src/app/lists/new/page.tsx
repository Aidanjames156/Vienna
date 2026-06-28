"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { SectionHead } from "@/components/SectionHead";
import { AlbumCover } from "@/components/AlbumCover";

type User = {
  id: number;
  spotify_id: string;
  display_name: string | null;
};

type SearchAlbum = {
  id: string;
  name: string;
  artists: string[];
  image: string | null;
  release_date: string;
};

export default function NewListPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isRanked, setIsRanked] = useState(false);
  const [tags, setTags] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [albums, setAlbums] = useState<SearchAlbum[]>([]);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchAlbum[]>([]);
  const [searching, setSearching] = useState(false);

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

  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(
          `${apiUrl}/spotify/search?query=${encodeURIComponent(
            query.trim()
          )}&limit=6`,
          { credentials: "include" }
        );
        const data = await response.json();
        setSuggestions(Array.isArray(data.albums) ? data.albums : []);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [apiUrl, query]);

  async function handleLogout() {
    await fetch(`${apiUrl}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    setUser(null);
  }

  function handleAddAlbum(album: SearchAlbum) {
    setAlbums((prev) =>
      prev.some((a) => a.id === album.id) ? prev : [...prev, album]
    );
    setQuery("");
    setSuggestions([]);
  }

  function handleRemoveAlbum(albumId: string) {
    setAlbums((prev) => prev.filter((album) => album.id !== albumId));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("List title is required.");
      return;
    }

    setSubmitting(true);
    try {
      const parsedTags = tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);

      const response = await fetch(`${apiUrl}/me/lists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          is_ranked: isRanked,
          tags: parsedTags,
        }),
      });

      if (response.status === 401) {
        setError("Sign in to create a list.");
        return;
      }

      if (response.status === 400) {
        const data = await response.json().catch(() => null);
        if (data?.error === "tags_too_many") {
          setError("Limit tags to 8.");
          return;
        }
        if (data?.error === "tag_too_long") {
          setError("Tags must be 24 characters or less.");
          return;
        }
      }

      if (!response.ok) {
        setError("Could not create list.");
        return;
      }

      const data = await response.json();
      const listId = data.list?.id;
      if (!listId) {
        router.push("/profile");
        return;
      }

      // Add the chosen albums to the freshly created list, then set their
      // order to match the builder (top-to-bottom) for both ranked and
      // unranked lists. Items are validated server-side one at a time.
      const addedIds: string[] = [];
      for (const album of albums) {
        const itemResponse = await fetch(`${apiUrl}/lists/${listId}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ spotify_album_id: album.id }),
        });
        if (itemResponse.ok) {
          addedIds.push(album.id);
        }
      }

      if (addedIds.length > 1) {
        await fetch(`${apiUrl}/lists/${listId}/reorder`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ order: addedIds }),
        }).catch(() => null);
      }

      router.push(`/lists/${listId}`);
    } catch {
      setError("Could not create list.");
    } finally {
      setSubmitting(false);
    }
  }

  const suggestionOpen = query.trim().length > 1 && suggestions.length > 0;

  return (
    <Shell user={user} onLogout={handleLogout}>
      <main style={{ maxWidth: 1320, margin: "0 auto", padding: "0 40px" }}>
        {/* ══════════ HERO ══════════ */}
        <section style={{ padding: "56px 0 40px" }}>
          <div className="eyebrow" style={{ marginBottom: 18 }}>
            Your lists
          </div>
          <h1
            className="display"
            style={{ fontSize: "clamp(48px, 6vw, 88px)", margin: 0, maxWidth: 880 }}
          >
            Curate a <em>new list.</em>
          </h1>
          <p className="pull" style={{ fontSize: 22, marginTop: 24, maxWidth: 520 }}>
            Group the records that belong together — a mood, an era, a canon of
            your own making.
          </p>
        </section>

        {/* ══════════ BUILDER ══════════ */}
        <section style={{ padding: "48px 0", borderTop: "1px solid var(--ink)" }}>
          {!authChecked && <div className="eyebrow">Checking session…</div>}

          {authChecked && !user && (
            <div style={{ maxWidth: 520 }}>
              <p className="pull" style={{ fontSize: 22, marginBottom: 20 }}>
                Sign in to start building lists.
              </p>
              <a
                className="btn primary"
                href={`${apiUrl}/auth/spotify`}
                style={{ gap: 8 }}
              >
                Continue with Spotify
                <span aria-hidden="true">→</span>
              </a>
            </div>
          )}

          {user && (
            <form onSubmit={handleSubmit}>
              {/* ── details ── */}
              <div style={{ display: "grid", gap: 28, maxWidth: 640 }}>
                <div style={{ display: "grid", gap: 8 }}>
                  <label className="eyebrow">Title</label>
                  <input
                    className="field-line"
                    style={{ width: "100%", fontSize: 18 }}
                    placeholder="Name your list"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  <label className="eyebrow">Description</label>
                  <textarea
                    className="field-line"
                    style={{ width: "100%", minHeight: 80, resize: "vertical" }}
                    placeholder="What ties these records together? (optional)"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  <label className="eyebrow">Tags</label>
                  <input
                    className="field-line"
                    style={{ width: "100%" }}
                    placeholder="R&B, Classics, Late Night"
                    value={tags}
                    onChange={(event) => setTags(event.target.value)}
                  />
                  <p className="eyebrow" style={{ color: "var(--muted)" }}>
                    Up to 8 tags · separate with commas
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsRanked((prev) => !prev)}
                  aria-pressed={isRanked}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    background: "none",
                    border: 0,
                    padding: 0,
                    cursor: "pointer",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 16,
                      height: 16,
                      flexShrink: 0,
                      border: "1px solid var(--ink)",
                      background: isRanked ? "var(--accent)" : "transparent",
                    }}
                  />
                  <span className="eyebrow">
                    Ranked list — albums keep the order below
                  </span>
                </button>
              </div>

              {/* ── the records ── */}
              <div
                style={{
                  marginTop: 56,
                  paddingTop: 48,
                  borderTop: "1px solid var(--ink)",
                }}
              >
                <SectionHead
                  title="The records"
                  emph="records"
                  count={`${albums.length} album${
                    albums.length === 1 ? "" : "s"
                  }`}
                />

                <div style={{ position: "relative", maxWidth: 640 }}>
                  <input
                    className="field-line"
                    style={{ width: "100%" }}
                    placeholder="Search an album to add"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  {searching && (
                    <div className="eyebrow" style={{ marginTop: 6 }}>
                      Searching…
                    </div>
                  )}
                  {suggestionOpen && (
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: "100%",
                        zIndex: 10,
                        marginTop: 8,
                        border: "1px solid var(--ink)",
                        borderBottom: 0,
                        background: "var(--bg)",
                      }}
                    >
                      {suggestions.map((album) => (
                        <button
                          key={album.id}
                          type="button"
                          onClick={() => handleAddAlbum(album)}
                          style={{
                            display: "flex",
                            width: "100%",
                            alignItems: "center",
                            gap: 12,
                            padding: "8px 12px",
                            borderBottom: "1px solid var(--line-strong)",
                            background: "transparent",
                            textAlign: "left",
                            cursor: "pointer",
                          }}
                        >
                          <span style={{ width: 40, flexShrink: 0 }}>
                            <AlbumCover
                              src={album.image}
                              alt={`${album.name} cover`}
                            />
                          </span>
                          <span style={{ minWidth: 0 }}>
                            <span
                              style={{
                                display: "block",
                                fontSize: 13,
                                fontWeight: 500,
                              }}
                            >
                              {album.name}
                            </span>
                            <span className="eyebrow">
                              {album.artists.join(", ")}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {albums.length === 0 ? (
                  <p
                    className="pull"
                    style={{ fontSize: 18, color: "var(--muted)", marginTop: 24 }}
                  >
                    No albums yet. Search above to start building.
                  </p>
                ) : (
                  <div style={{ display: "grid", gap: 0, marginTop: 24, maxWidth: 720 }}>
                    {albums.map((album, i) => (
                      <div
                        key={album.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: isRanked
                            ? "28px 48px 1fr auto"
                            : "48px 1fr auto",
                          gap: 16,
                          alignItems: "center",
                          padding: "12px 0",
                          borderTop:
                            i === 0
                              ? "1px solid var(--ink)"
                              : "1px solid var(--line)",
                          borderBottom:
                            i === albums.length - 1
                              ? "1px solid var(--ink)"
                              : undefined,
                        }}
                      >
                        {isRanked && (
                          <span
                            className="display"
                            style={{ fontSize: 22, fontStyle: "italic" }}
                          >
                            {i + 1}
                          </span>
                        )}
                        <span style={{ width: 48, flexShrink: 0 }}>
                          <AlbumCover
                            src={album.image}
                            alt={`${album.name} cover`}
                          />
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <span
                            style={{
                              display: "block",
                              fontSize: 14,
                              fontWeight: 500,
                            }}
                          >
                            {album.name}
                          </span>
                          <span className="eyebrow">
                            {album.artists.join(", ")}
                          </span>
                        </span>
                        <button
                          type="button"
                          className="eyebrow"
                          onClick={() => handleRemoveAlbum(album.id)}
                          style={{
                            cursor: "pointer",
                            color: "var(--accent)",
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── actions ── */}
              {error && (
                <div className="note" style={{ marginTop: 40, maxWidth: 640 }}>
                  {error}
                </div>
              )}
              <div
                style={{
                  marginTop: error ? 20 : 48,
                  display: "flex",
                  gap: 24,
                  alignItems: "center",
                }}
              >
                <button type="submit" className="text-btn" disabled={submitting}>
                  {submitting ? (
                    "Creating…"
                  ) : (
                    <>
                      Create list
                      <span aria-hidden="true">→</span>
                    </>
                  )}
                </button>
                <Link
                  href="/profile"
                  className="text-btn"
                  style={{ color: "var(--muted)" }}
                >
                  Cancel
                </Link>
              </div>
            </form>
          )}
        </section>
      </main>
    </Shell>
  );
}
