"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { SectionHead } from "@/components/SectionHead";
import { AlbumCover } from "@/components/AlbumCover";

type User = {
  id: number;
  spotify_id: string;
  display_name: string | null;
};

type ListItem = {
  spotify_album_id: string;
  created_at: string;
  position?: number;
};

type ListDetail = {
  id: number;
  title: string;
  description: string | null;
  is_ranked: boolean;
  created_at: string;
  likes_count: number;
  liked_by_me: boolean;
  tags: string[];
  items: ListItem[];
};

type AlbumCard = {
  id: string;
  name: string;
  artists: string[];
  image: string | null;
};

type SearchAlbum = {
  id: string;
  name: string;
  artists: string[];
  image: string | null;
  release_date: string;
};

type ListComment = {
  id: number;
  body: string;
  created_at: string;
  user: {
    id: number;
    spotify_id: string;
    display_name: string | null;
    avatar_url: string | null;
  };
};

export default function ListPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";
  const params = useParams();
  const rawId = params?.id;
  const listId = Array.isArray(rawId) ? rawId[0] : rawId;
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [list, setList] = useState<ListDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [albumMap, setAlbumMap] = useState<Record<string, AlbumCard>>({});

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchAlbum[]>([]);
  const [searching, setSearching] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [reorderSaving, setReorderSaving] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [rankedSaving, setRankedSaving] = useState(false);
  const [rankedError, setRankedError] = useState<string | null>(null);
  const [listDeleting, setListDeleting] = useState(false);
  const [listDeleteError, setListDeleteError] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [titleSaving, setTitleSaving] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [likeSaving, setLikeSaving] = useState(false);
  const [likeError, setLikeError] = useState<string | null>(null);
  const [editingTags, setEditingTags] = useState(false);
  const [tagsDraft, setTagsDraft] = useState("");
  const [tagsSaving, setTagsSaving] = useState(false);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [comments, setComments] = useState<ListComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  const suggestionOpen = useMemo(
    () => query.trim().length > 1 && suggestions.length > 0,
    [query, suggestions]
  );

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

  useEffect(() => {
    let cancelled = false;

    async function loadList() {
      if (!listId) {
        setError("Missing list id.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${apiUrl}/lists/${listId}`, {
          credentials: "include",
        });

        if (response.status === 401) {
          setError("Sign in to view this list.");
          setLoading(false);
          return;
        }

        if (!response.ok) {
          setError("List not found.");
          setLoading(false);
          return;
        }

        const data = await response.json();
        if (!cancelled) {
          setList(data.list || null);
          if (data.list?.title) {
            setTitleDraft(data.list.title);
          }
          setTagsDraft(Array.isArray(data.list?.tags) ? data.list.tags.join(", ") : "");
        }
      } catch (err) {
        if (!cancelled) {
          setError("Could not load list.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadList();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, listId]);

  useEffect(() => {
    let cancelled = false;

    async function loadComments() {
      if (!listId || !list) {
        return;
      }

      setCommentsLoading(true);
      setCommentsError(null);
      try {
        const response = await fetch(`${apiUrl}/lists/${listId}/comments`, {
          credentials: "include",
        });

        if (response.status === 401) {
          setComments([]);
          setCommentsError("Sign in to view comments.");
          return;
        }

        if (!response.ok) {
          setCommentsError("Could not load comments.");
          return;
        }

        const data = await response.json();
        if (!cancelled) {
          setComments(Array.isArray(data.comments) ? data.comments : []);
        }
      } catch (err) {
        if (!cancelled) {
          setCommentsError("Could not load comments.");
        }
      } finally {
        if (!cancelled) {
          setCommentsLoading(false);
        }
      }
    }

    loadComments();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, listId, list]);

  useEffect(() => {
    let cancelled = false;

    async function loadAlbums() {
      if (!list || list.items.length === 0) {
        return;
      }

      const validIds = Array.from(
        new Set(list.items.map((item) => item.spotify_album_id))
      ).filter((id) => /^[A-Za-z0-9]{22}$/.test(id));

      const uniqueIds = validIds.filter((id) => !albumMap[id]);

      if (uniqueIds.length === 0) {
        return;
      }

      try {
        const chunks: string[][] = [];
        for (let i = 0; i < uniqueIds.length; i += 20) {
          chunks.push(uniqueIds.slice(i, i + 20));
        }

        const responses = await Promise.all(
          chunks.map((chunk) =>
            fetch(`${apiUrl}/spotify/albums?ids=${chunk.join(",")}`, {
              credentials: "include",
            })
          )
        );

        const albums = await Promise.all(
          responses.map(async (response) => {
            if (!response.ok) {
              return [];
            }
            const data = await response.json();
            return Array.isArray(data.albums) ? data.albums : [];
          })
        );

        if (!cancelled) {
          setAlbumMap((prev) => {
            const next = { ...prev };
            albums.flat().forEach((album) => {
              if (!album) {
                return;
              }
              next[album.id] = {
                id: album.id,
                name: album.name,
                artists: album.artists || [],
                image: album.images?.[1]?.url || album.images?.[0]?.url || null,
              };
            });
            return next;
          });
        }
      } catch (err) {
        // ignore album enrichment errors
      }
    }

    loadAlbums();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, list, albumMap]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(
          `${apiUrl}/spotify/search?query=${encodeURIComponent(query.trim())}&limit=6`,
          { credentials: "include" }
        );
        const data = await response.json();
        setSuggestions(Array.isArray(data.albums) ? data.albums : []);
      } catch (err) {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [apiUrl, query]);

  function extractAlbumId(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }

    const urlMatch = trimmed.match(/open\.spotify\.com\/album\/([a-zA-Z0-9]+)/);
    if (urlMatch) {
      return urlMatch[1];
    }

    const uriMatch = trimmed.match(/spotify:album:([a-zA-Z0-9]+)/);
    if (uriMatch) {
      return uriMatch[1];
    }

    if (/^[a-zA-Z0-9]{22}$/.test(trimmed)) {
      return trimmed;
    }

    return "";
  }

  async function addAlbumToList(albumId: string) {
    if (!listId) {
      return;
    }

    setAddError(null);
    setAdding(true);
    try {
      const response = await fetch(`${apiUrl}/lists/${listId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ spotify_album_id: albumId }),
      });

      if (response.status === 401) {
        setAddError("Sign in to add albums.");
        return;
      }

      if (response.status === 400) {
        const data = await response.json().catch(() => null);
        if (data?.error === "invalid_album_id") {
          setAddError("Pick a suggestion so we can verify the album.");
          return;
        }
        if (data?.error === "spotify_unavailable") {
          setAddError("Spotify is unavailable right now. Try again.");
          return;
        }
      }

      if (!response.ok) {
        setAddError("Could not add album.");
        return;
      }

      setList((prev) => {
        if (!prev) {
          return prev;
        }
        const exists = prev.items.some(
          (item) => item.spotify_album_id === albumId
        );
        if (exists) {
          return prev;
        }
        const topPosition = prev.items[0]?.position ?? 0;
        return {
          ...prev,
          items: [
            {
              spotify_album_id: albumId,
              created_at: new Date().toISOString(),
              position: topPosition + 1,
            },
            ...prev.items,
          ],
        };
      });
      setQuery("");
      setSuggestions([]);
    } catch (err) {
      setAddError("Could not add album.");
    } finally {
      setAdding(false);
    }
  }

  async function handleAddSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const albumId = extractAlbumId(query);
    if (!albumId) {
      if (suggestions.length > 0) {
        await addAlbumToList(suggestions[0].id);
        return;
      }
      setAddError("Pick a suggestion or paste a Spotify album URL.");
      return;
    }

    await addAlbumToList(albumId);
  }

  async function handleRankedToggle(nextValue: boolean) {
    if (!listId || !list) {
      return;
    }

    setRankedSaving(true);
    setRankedError(null);
    try {
      const response = await fetch(`${apiUrl}/lists/${listId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ is_ranked: nextValue }),
      });

      if (!response.ok) {
        throw new Error("ranked_update_failed");
      }

      const data = await response.json();
      const updatedRanked =
        typeof data?.list?.is_ranked === "boolean"
          ? data.list.is_ranked
          : nextValue;

      setList((prev) =>
        prev ? { ...prev, is_ranked: updatedRanked } : prev
      );
    } catch (err) {
      setRankedError("Could not update list ranking.");
    } finally {
      setRankedSaving(false);
    }
  }

  async function handleTitleSave() {
    if (!listId) {
      return;
    }

    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      setTitleError("Title is required.");
      return;
    }

    setTitleSaving(true);
    setTitleError(null);
    try {
      const response = await fetch(`${apiUrl}/lists/${listId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: nextTitle }),
      });

      if (response.status === 401) {
        setTitleError("Sign in to update this list.");
        return;
      }

      if (!response.ok) {
        setTitleError("Could not update list title.");
        return;
      }

      const data = await response.json();
      setList((prev) =>
        prev ? { ...prev, title: data.list?.title || nextTitle } : prev
      );
      setEditingTitle(false);
    } catch (err) {
      setTitleError("Could not update list title.");
    } finally {
      setTitleSaving(false);
    }
  }

  function handleTitleCancel() {
    setEditingTitle(false);
    setTitleError(null);
    setTitleDraft(list?.title || "");
  }

  function parseTagsInput(value: string) {
    return value
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }

  async function handleTagsSave() {
    if (!listId) {
      return;
    }

    const nextTags = parseTagsInput(tagsDraft);

    setTagsSaving(true);
    setTagsError(null);
    try {
      const response = await fetch(`${apiUrl}/lists/${listId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tags: nextTags }),
      });

      if (response.status === 401) {
        setTagsError("Sign in to update tags.");
        return;
      }

      if (response.status === 400) {
        const data = await response.json().catch(() => null);
        if (data?.error === "tags_too_many") {
          setTagsError("Limit tags to 8.");
          return;
        }
        if (data?.error === "tag_too_long") {
          setTagsError("Tags must be 24 characters or less.");
          return;
        }
      }

      if (!response.ok) {
        setTagsError("Could not update tags.");
        return;
      }

      const data = await response.json().catch(() => null);
      const updatedTags = Array.isArray(data?.list?.tags)
        ? data.list.tags
        : nextTags;

      setList((prev) => (prev ? { ...prev, tags: updatedTags } : prev));
      setEditingTags(false);
      setTagsDraft(updatedTags.join(", "));
    } catch (err) {
      setTagsError("Could not update tags.");
    } finally {
      setTagsSaving(false);
    }
  }

  function handleTagsCancel() {
    setEditingTags(false);
    setTagsError(null);
    setTagsDraft(list?.tags?.join(", ") || "");
  }

  async function handleDeleteList() {
    if (!listId) {
      return;
    }

    if (!window.confirm("Delete this list?")) {
      return;
    }

    setListDeleting(true);
    setListDeleteError(null);
    try {
      const response = await fetch(`${apiUrl}/lists/${listId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.status === 401) {
        setListDeleteError("Sign in to delete this list.");
        return;
      }

      if (!response.ok) {
        setListDeleteError("Could not delete list.");
        return;
      }

      router.push("/profile");
    } catch (err) {
      setListDeleteError("Could not delete list.");
    } finally {
      setListDeleting(false);
    }
  }

  async function handleLikeToggle() {
    if (!listId || !list) {
      return;
    }

    setLikeSaving(true);
    setLikeError(null);
    try {
      const response = await fetch(`${apiUrl}/lists/${listId}/like`, {
        method: list.liked_by_me ? "DELETE" : "POST",
        credentials: "include",
      });

      if (response.status === 401) {
        setLikeError("Sign in to like lists.");
        return;
      }

      if (!response.ok) {
        setLikeError("Could not update like.");
        return;
      }

      const data = await response.json().catch(() => null);
      setList((prev) => {
        if (!prev) {
          return prev;
        }
        const fallbackCount = Math.max(
          0,
          (prev.likes_count || 0) + (prev.liked_by_me ? -1 : 1)
        );
        const nextCount =
          typeof data?.likes_count === "number" ? data.likes_count : fallbackCount;
        const nextLiked =
          typeof data?.liked_by_me === "boolean"
            ? data.liked_by_me
            : !prev.liked_by_me;
        return { ...prev, likes_count: nextCount, liked_by_me: nextLiked };
      });
    } catch (err) {
      setLikeError("Could not update like.");
    } finally {
      setLikeSaving(false);
    }
  }

  async function handleCommentSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!listId || !list) {
      return;
    }

    const body = commentDraft.trim();
    if (!body) {
      setCommentsError("Write a comment before posting.");
      return;
    }

    setCommentSubmitting(true);
    setCommentsError(null);
    try {
      const response = await fetch(`${apiUrl}/lists/${listId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body }),
      });

      if (response.status === 401) {
        setCommentsError("Sign in to comment.");
        return;
      }

      if (!response.ok) {
        setCommentsError("Could not post comment.");
        return;
      }

      const data = await response.json();
      if (data.comment) {
        setComments((prev) => [data.comment, ...prev]);
        setCommentDraft("");
      }
    } catch (err) {
      setCommentsError("Could not post comment.");
    } finally {
      setCommentSubmitting(false);
    }
  }

  function buildOrderedItems(
    items: ListItem[],
    sourceId: string,
    targetId: string
  ) {
    const currentIndex = items.findIndex(
      (item) => item.spotify_album_id === sourceId
    );
    const targetIndex = items.findIndex(
      (item) => item.spotify_album_id === targetId
    );

    if (
      currentIndex < 0 ||
      targetIndex < 0 ||
      currentIndex === targetIndex
    ) {
      return null;
    }

    const nextItems = [...items];
    const [moved] = nextItems.splice(currentIndex, 1);
    nextItems.splice(targetIndex, 0, moved);

    return nextItems.map((item, index) => ({
      ...item,
      position: nextItems.length - index,
    }));
  }

  async function persistOrder(
    orderedItems: ListItem[],
    previousItems: ListItem[]
  ) {
    if (!listId) {
      return;
    }

    setReorderSaving(true);
    setReorderError(null);
    try {
      const response = await fetch(`${apiUrl}/lists/${listId}/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          order: orderedItems.map((item) => item.spotify_album_id),
        }),
      });

      if (!response.ok) {
        throw new Error("reorder_failed");
      }
    } catch (err) {
      setReorderError("Could not save the new order.");
      setList((prev) => (prev ? { ...prev, items: previousItems } : prev));
    } finally {
      setReorderSaving(false);
    }
  }

  function handleDragStart(
    event: React.DragEvent<HTMLDivElement>,
    itemId: string
  ) {
    if (reorderSaving || !list?.is_ranked) {
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", itemId);
    setDraggingId(itemId);
  }

  function handleDragOver(
    event: React.DragEvent<HTMLDivElement>,
    itemId: string
  ) {
    if (reorderSaving || !list?.is_ranked) {
      return;
    }
    event.preventDefault();
    if (dragOverId !== itemId) {
      setDragOverId(itemId);
    }
  }

  async function handleDrop(
    event: React.DragEvent<HTMLDivElement>,
    targetId: string
  ) {
    event.preventDefault();
    if (!list || reorderSaving || !list.is_ranked) {
      return;
    }

    const sourceId =
      draggingId || event.dataTransfer.getData("text/plain") || "";
    setDraggingId(null);
    setDragOverId(null);

    if (!sourceId || sourceId === targetId) {
      return;
    }

    const previousItems = list.items;
    const orderedItems = buildOrderedItems(previousItems, sourceId, targetId);
    if (!orderedItems) {
      return;
    }

    setList((prev) => (prev ? { ...prev, items: orderedItems } : prev));
    await persistOrder(orderedItems, previousItems);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDragOverId(null);
  }

  function formatDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleDateString();
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
        {error ? (
          <section style={{ padding: "56px 0" }}>
            <div className="note" style={{ maxWidth: 640 }}>
              {error}
            </div>
          </section>
        ) : !list ? (
          <section style={{ padding: "56px 0" }}>
            <div className="eyebrow">Loading…</div>
          </section>
        ) : (
          <>
            {/* ══════════ HEAD ══════════ */}
            <section style={{ padding: "56px 0 32px" }}>
              <div className="eyebrow" style={{ marginBottom: 18 }}>
                Your lists
              </div>

              {editingTitle ? (
                <div style={{ display: "grid", gap: 12, maxWidth: 640 }}>
                  <input
                    className="field-line"
                    style={{ width: "100%", fontSize: 28 }}
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                  />
                  <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                    <button
                      type="button"
                      className="text-btn"
                      onClick={handleTitleSave}
                      disabled={titleSaving}
                    >
                      {titleSaving ? (
                        "Saving…"
                      ) : (
                        <>
                          Save
                          <span aria-hidden="true">→</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      className="text-btn"
                      style={{ color: "var(--muted)" }}
                      onClick={handleTitleCancel}
                      disabled={titleSaving}
                    >
                      Cancel
                    </button>
                  </div>
                  {titleError && <div className="note">{titleError}</div>}
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 20,
                    flexWrap: "wrap",
                  }}
                >
                  <h1
                    className="display"
                    style={{ fontSize: "clamp(44px, 6vw, 88px)", margin: 0 }}
                  >
                    {list.title || "Untitled list"}
                  </h1>
                  <button
                    type="button"
                    className="eyebrow"
                    onClick={() => setEditingTitle(true)}
                    style={{
                      cursor: "pointer",
                      color: "var(--ink)",
                      borderBottom: "1px solid var(--ink)",
                    }}
                  >
                    Edit
                  </button>
                </div>
              )}

              {list.description && (
                <p
                  className="pull"
                  style={{ fontSize: 22, marginTop: 20, maxWidth: 640 }}
                >
                  {list.description}
                </p>
              )}

              {/* tags */}
              {editingTags ? (
                <div style={{ display: "grid", gap: 10, maxWidth: 640, marginTop: 20 }}>
                  <input
                    className="field-line"
                    style={{ width: "100%" }}
                    value={tagsDraft}
                    onChange={(event) => setTagsDraft(event.target.value)}
                    placeholder="Tags (comma separated)"
                  />
                  <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                    <button
                      type="button"
                      className="text-btn"
                      onClick={handleTagsSave}
                      disabled={tagsSaving}
                    >
                      {tagsSaving ? (
                        "Saving…"
                      ) : (
                        <>
                          Save tags
                          <span aria-hidden="true">→</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      className="text-btn"
                      style={{ color: "var(--muted)" }}
                      onClick={handleTagsCancel}
                      disabled={tagsSaving}
                    >
                      Cancel
                    </button>
                    <span className="eyebrow" style={{ color: "var(--muted)" }}>
                      Up to 8 tags
                    </span>
                  </div>
                  {tagsError && <div className="note">{tagsError}</div>}
                </div>
              ) : (
                <div
                  className="eyebrow"
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 10,
                    marginTop: 20,
                    alignItems: "center",
                  }}
                >
                  {list.tags && list.tags.length > 0 ? (
                    list.tags.map((tag) => (
                      <span
                        key={tag}
                        style={{
                          border: "1px solid var(--line-strong)",
                          padding: "4px 8px",
                        }}
                      >
                        #{tag}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: "var(--muted)" }}>No tags yet</span>
                  )}
                  <button
                    type="button"
                    className="eyebrow"
                    onClick={() => setEditingTags(true)}
                    style={{
                      cursor: "pointer",
                      color: "var(--ink)",
                      borderBottom: "1px solid var(--ink)",
                    }}
                  >
                    Edit tags
                  </button>
                </div>
              )}

              {/* meta actions */}
              <div
                style={{
                  display: "flex",
                  gap: 20,
                  marginTop: 24,
                  alignItems: "center",
                }}
              >
                <button
                  type="button"
                  className="quiet-link"
                  onClick={handleLikeToggle}
                  disabled={likeSaving}
                >
                  {likeSaving
                    ? "Saving…"
                    : list.liked_by_me
                      ? "Unlike"
                      : "Like"}
                  {` · ${list.likes_count ?? 0} like${
                    (list.likes_count ?? 0) === 1 ? "" : "s"
                  }`}
                </button>
                <button
                  type="button"
                  className="quiet-link"
                  style={{ color: "var(--accent)" }}
                  onClick={handleDeleteList}
                  disabled={listDeleting}
                >
                  {listDeleting ? "Deleting…" : "Delete list"}
                </button>
              </div>

              {(likeError || listDeleteError) && (
                <div className="note" style={{ marginTop: 16, maxWidth: 640 }}>
                  {likeError || listDeleteError}
                </div>
              )}
            </section>

            {/* ══════════ RECORDS ══════════ */}
            <section style={{ padding: "48px 0", borderTop: "1px solid var(--ink)" }}>
              <SectionHead
                title="The records"
                emph="records"
                count={`${list.items.length} album${
                  list.items.length === 1 ? "" : "s"
                }${list.is_ranked ? " · ranked" : ""}`}
              />

              {/* add album */}
              <form
                onSubmit={handleAddSubmit}
                style={{ position: "relative", maxWidth: 640 }}
              >
                <input
                  className="field-line"
                  style={{ width: "100%" }}
                  placeholder="Search an album or paste a Spotify URL"
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
                        onClick={() => addAlbumToList(album.id)}
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
                          <AlbumCover src={album.image} alt={`${album.name} cover`} />
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <span
                            style={{ display: "block", fontSize: 13, fontWeight: 500 }}
                          >
                            {album.name}
                          </span>
                          <span className="eyebrow">{album.artists.join(", ")}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </form>
              {addError && (
                <div className="note" style={{ marginTop: 16, maxWidth: 640 }}>
                  {addError}
                </div>
              )}

              {/* ranked toggle */}
              <button
                type="button"
                onClick={() => handleRankedToggle(!list.is_ranked)}
                disabled={rankedSaving}
                aria-pressed={list.is_ranked}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  background: "none",
                  border: 0,
                  padding: 0,
                  cursor: "pointer",
                  marginTop: 28,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 16,
                    height: 16,
                    flexShrink: 0,
                    border: "1px solid var(--ink)",
                    background: list.is_ranked ? "var(--accent)" : "transparent",
                  }}
                />
                <span className="eyebrow">
                  {rankedSaving
                    ? "Saving…"
                    : list.is_ranked
                      ? "Ranked — drag to reorder"
                      : "Ranked list"}
                </span>
              </button>
              {(rankedError || reorderError) && (
                <div className="note" style={{ marginTop: 16, maxWidth: 640 }}>
                  {rankedError || reorderError}
                </div>
              )}

              {/* items */}
              {list.items.length === 0 ? (
                <p
                  className="pull"
                  style={{ fontSize: 18, color: "var(--muted)", marginTop: 24 }}
                >
                  No albums yet. Search above to add one.
                </p>
              ) : (
                <div style={{ display: "grid", gap: 0, marginTop: 24, maxWidth: 820 }}>
                  {list.items.map((item, index) => {
                    const album = albumMap[item.spotify_album_id];
                    const isDragOver = dragOverId === item.spotify_album_id;
                    const isDragging = draggingId === item.spotify_album_id;
                    return (
                      <div
                        key={item.spotify_album_id}
                        draggable={list.is_ranked && !reorderSaving}
                        onDragStart={(event) =>
                          handleDragStart(event, item.spotify_album_id)
                        }
                        onDragOver={(event) =>
                          handleDragOver(event, item.spotify_album_id)
                        }
                        onDrop={(event) => handleDrop(event, item.spotify_album_id)}
                        onDragEnd={handleDragEnd}
                        style={{
                          display: "grid",
                          gridTemplateColumns: list.is_ranked
                            ? "28px 56px 1fr"
                            : "56px 1fr",
                          gap: 16,
                          alignItems: "center",
                          padding: "12px 8px",
                          borderTop:
                            index === 0
                              ? "1px solid var(--ink)"
                              : "1px solid var(--line)",
                          borderBottom:
                            index === list.items.length - 1
                              ? "1px solid var(--ink)"
                              : undefined,
                          background: isDragOver ? "var(--accent-soft)" : undefined,
                          opacity: isDragging ? 0.6 : 1,
                          cursor: list.is_ranked ? "grab" : "default",
                        }}
                      >
                        {list.is_ranked && (
                          <span
                            className="display"
                            style={{ fontSize: 22, fontStyle: "italic" }}
                          >
                            {index + 1}
                          </span>
                        )}
                        <span style={{ width: 56, flexShrink: 0 }}>
                          <AlbumCover
                            src={album?.image}
                            alt={album?.name || "Album"}
                          />
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <Link
                            href={`/albums/${item.spotify_album_id}`}
                            style={{
                              display: "block",
                              fontSize: 14,
                              fontWeight: 500,
                              color: "var(--ink)",
                            }}
                          >
                            {album?.name || "Unknown album"}
                          </Link>
                          <span className="eyebrow">
                            {album?.artists?.join(", ") || item.spotify_album_id}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {reorderSaving && (
                <div className="eyebrow" style={{ marginTop: 12 }}>
                  Saving order…
                </div>
              )}
            </section>

            {/* ══════════ COMMENTS ══════════ */}
            <section style={{ padding: "48px 0", borderTop: "1px solid var(--ink)" }}>
              <SectionHead
                title="Comments"
                emph="Comments"
                count={`${comments.length} total`}
              />

              <form
                onSubmit={handleCommentSubmit}
                style={{ display: "grid", gap: 14, maxWidth: 640 }}
              >
                <textarea
                  className="field-line"
                  style={{ width: "100%", minHeight: 80, resize: "vertical" }}
                  placeholder="Leave a comment about this list…"
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                />
                <div>
                  <button
                    type="submit"
                    className="text-btn"
                    disabled={commentSubmitting}
                  >
                    {commentSubmitting ? (
                      "Posting…"
                    ) : (
                      <>
                        Post comment
                        <span aria-hidden="true">→</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              {commentsError && (
                <div className="note" style={{ marginTop: 16, maxWidth: 640 }}>
                  {commentsError}
                </div>
              )}
              {commentsLoading && (
                <div className="eyebrow" style={{ marginTop: 16 }}>
                  Loading comments…
                </div>
              )}
              {!commentsLoading && comments.length === 0 && (
                <p
                  className="pull"
                  style={{ fontSize: 18, color: "var(--muted)", marginTop: 16 }}
                >
                  No comments yet.
                </p>
              )}

              <div style={{ display: "grid", gap: 0, marginTop: 24, maxWidth: 720 }}>
                {comments.map((comment, i) => (
                  <article
                    key={comment.id}
                    style={{
                      padding: "20px 0",
                      borderTop:
                        i === 0
                          ? "1px solid var(--ink)"
                          : "1px solid var(--line)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span
                        style={{
                          width: 36,
                          height: 36,
                          flexShrink: 0,
                          overflow: "hidden",
                          background: "var(--bg-strong)",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {comment.user.avatar_url ? (
                          <img
                            src={comment.user.avatar_url}
                            alt={comment.user.display_name || comment.user.spotify_id}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <span
                            className="display"
                            style={{ fontStyle: "italic", color: "var(--muted)" }}
                          >
                            {(comment.user.display_name || comment.user.spotify_id || "U")
                              .charAt(0)
                              .toUpperCase()}
                          </span>
                        )}
                      </span>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>
                          {comment.user.display_name || comment.user.spotify_id}
                        </div>
                        <div className="eyebrow">{formatDate(comment.created_at)}</div>
                      </div>
                    </div>
                    <p
                      className="pull"
                      style={{ fontSize: 18, marginTop: 10, color: "var(--ink)" }}
                    >
                      {comment.body}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </Shell>
  );
}
