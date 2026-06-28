"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Shell } from "@/components/Shell";
import { SectionHead } from "@/components/SectionHead";
import { AlbumCover } from "@/components/AlbumCover";
import { Stars, rating10ToStars } from "@/components/Stars";

type User = {
  id: number;
  spotify_id: string;
  display_name: string | null;
};

type Review = {
  id: number;
  rating: number;
  body: string | null;
  created_at: string;
  is_pinned?: boolean;
  pinned_at?: string | null;
  user: User;
};

type AlbumDetail = {
  id: string;
  name: string;
  artists: string[];
  images: { url: string; width: number; height: number }[];
  release_date: string;
  total_tracks: number;
  label: string;
  genres: string[];
  tracks: {
    id: string;
    name: string;
    track_number: number;
    duration_ms: number;
    preview_url: string | null;
  }[];
};

export default function AlbumPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";
  const params = useParams();
  const rawId = params?.id;
  const albumId = Array.isArray(rawId) ? rawId[0] : rawId;

  const [user, setUser] = useState<User | null>(null);
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewActionError, setReviewActionError] = useState<string | null>(null);
  const [ratingValue, setRatingValue] = useState("8");
  const [bodyValue, setBodyValue] = useState("");

  // In-app track preview playback
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);

  function togglePreview(trackId: string, url: string) {
    const audio = audioRef.current;
    if (!audio) return;

    if (playingTrackId === trackId) {
      audio.pause();
      setPlayingTrackId(null);
      return;
    }

    audio.src = url;
    audio.play().catch(() => setPlayingTrackId(null));
    setPlayingTrackId(trackId);
  }
  const [submitting, setSubmitting] = useState(false);
  const [editingReviewId, setEditingReviewId] = useState<number | null>(null);
  const [editRatingValue, setEditRatingValue] = useState("8");
  const [editBodyValue, setEditBodyValue] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewDeleting, setReviewDeleting] = useState<number | null>(null);
  const [reviewPinning, setReviewPinning] = useState<number | null>(null);

  const averageRating = useMemo(() => {
    if (reviews.length === 0) {
      return null;
    }
    const total = reviews.reduce((sum, review) => sum + review.rating, 0);
    return (total / reviews.length).toFixed(1);
  }, [reviews]);

  const myReview = useMemo(
    () => (user ? reviews.find((review) => review.user?.id === user.id) : undefined),
    [reviews, user]
  );

  const ratingDistribution = useMemo(() => {
    const buckets = Array.from({ length: 10 }, () => 0);
    reviews.forEach((review) => {
      if (review.rating >= 1 && review.rating <= 10) {
        buckets[review.rating - 1] += 1;
      }
    });
    return buckets;
  }, [reviews]);

  useEffect(() => {
    let cancelled = false;

    async function loadAlbum() {
      if (!albumId) {
        setError("Missing album id.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${apiUrl}/spotify/albums/${albumId}`, {
          credentials: "include",
        });

        if (!response.ok) {
          if (!cancelled) {
            setError("Could not load album details.");
          }
          return;
        }

        const data = await response.json();
        if (!cancelled) {
          if (!data.album) {
            setError("Album details unavailable.");
            setAlbum(null);
          } else {
            setAlbum(data.album);
          }
        }
      } catch {
        if (!cancelled) {
          setError("Could not load album details.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadAlbum();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, albumId]);

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
        }
      } catch {
        if (!cancelled) {
          setUser(null);
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

    async function loadReviews() {
      if (!albumId) {
        setReviews([]);
        setReviewsLoading(false);
        return;
      }

      setReviewsLoading(true);
      setReviewError(null);

      try {
        const response = await fetch(`${apiUrl}/albums/${albumId}/reviews`, {
          credentials: "include",
        });
        const data = await response.json();
        if (!cancelled) {
          setReviews(Array.isArray(data.reviews) ? data.reviews : []);
        }
      } catch {
        if (!cancelled) {
          setReviewError("Could not load reviews.");
        }
      } finally {
        if (!cancelled) {
          setReviewsLoading(false);
        }
      }
    }

    loadReviews();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, albumId]);

  async function handleReviewSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReviewError(null);

    if (!albumId) {
      setReviewError("Missing album id.");
      return;
    }

    const ratingNumber = parseInt(ratingValue, 10);
    if (Number.isNaN(ratingNumber) || ratingNumber < 1 || ratingNumber > 10) {
      setReviewError("Rating must be between 1 and 10.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${apiUrl}/albums/${albumId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          rating: ratingNumber,
          body: bodyValue.trim() || null,
        }),
      });

      if (response.status === 401) {
        setReviewError("Please sign in with Spotify to add a review.");
        return;
      }

      if (response.status === 409) {
        setReviewError(
          "You've already reviewed this album. Edit your existing review below."
        );
        return;
      }

      if (!response.ok) {
        setReviewError("Could not save review.");
        return;
      }

      setBodyValue("");
      const data = await response.json();
      if (data.review) {
        setReviews((prev) => [data.review, ...prev]);
      }
    } catch {
      setReviewError("Could not save review.");
    } finally {
      setSubmitting(false);
    }
  }

  function startEditReview(review: Review) {
    setReviewActionError(null);
    setEditingReviewId(review.id);
    setEditRatingValue(String(review.rating));
    setEditBodyValue(review.body || "");
  }

  async function handleReviewUpdate(reviewId: number) {
    const ratingNumber = parseInt(editRatingValue, 10);
    if (Number.isNaN(ratingNumber) || ratingNumber < 1 || ratingNumber > 10) {
      setReviewActionError("Rating must be between 1 and 10.");
      return;
    }

    setReviewSaving(true);
    setReviewActionError(null);
    try {
      const response = await fetch(`${apiUrl}/reviews/${reviewId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          rating: ratingNumber,
          body: editBodyValue.trim() || null,
        }),
      });

      if (!response.ok) {
        setReviewActionError("Could not update review.");
        return;
      }

      const data = await response.json();
      if (data.review) {
        setReviews((prev) =>
          prev.map((review) =>
            review.id === reviewId
              ? {
                  ...review,
                  rating: data.review.rating,
                  body: data.review.body,
                  is_pinned:
                    typeof data.review.is_pinned === "boolean"
                      ? data.review.is_pinned
                      : review.is_pinned,
                  pinned_at:
                    typeof data.review.pinned_at !== "undefined"
                      ? data.review.pinned_at
                      : review.pinned_at,
                }
              : review
          )
        );
        setEditingReviewId(null);
      }
    } catch {
      setReviewActionError("Could not update review.");
    } finally {
      setReviewSaving(false);
    }
  }

  async function handleReviewDelete(reviewId: number) {
    if (!window.confirm("Delete this review?")) {
      return;
    }

    setReviewDeleting(reviewId);
    setReviewActionError(null);
    try {
      const response = await fetch(`${apiUrl}/reviews/${reviewId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        setReviewActionError("Could not delete review.");
        return;
      }

      setReviews((prev) => prev.filter((review) => review.id !== reviewId));
    } catch {
      setReviewActionError("Could not delete review.");
    } finally {
      setReviewDeleting(null);
    }
  }

  async function handleReviewPin(reviewId: number, nextPinned: boolean) {
    setReviewPinning(reviewId);
    setReviewActionError(null);
    try {
      const response = await fetch(`${apiUrl}/reviews/${reviewId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ is_pinned: nextPinned }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        if (data?.error === "pinned_limit") {
          setReviewActionError("You can only pin 1 review.");
          return;
        }
        setReviewActionError("Could not update pinned reviews.");
        return;
      }

      const data = await response.json();
      if (data.review) {
        setReviews((prev) =>
          prev.map((review) =>
            review.id === reviewId
              ? {
                  ...review,
                  is_pinned: data.review.is_pinned,
                  pinned_at: data.review.pinned_at,
                }
              : review
          )
        );
      }
    } catch {
      setReviewActionError("Could not update pinned reviews.");
    } finally {
      setReviewPinning(null);
    }
  }

  function formatDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatDuration(ms: number) {
    if (!ms || Number.isNaN(ms)) {
      return "";
    }
    const totalSeconds = Math.round(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  const maxCount = Math.max(...ratingDistribution, 1);
  const sectionStyle: React.CSSProperties = {
    padding: "48px 0",
    borderTop: "1px solid var(--ink)",
  };

  return (
    <Shell user={user} onLogout={undefined}>
      <main style={{ maxWidth: 1320, margin: "0 auto", padding: "0 40px" }}>
        {loading && (
          <div className="eyebrow" style={{ padding: "56px 0" }}>
            Loading album…
          </div>
        )}

        {error && !loading && (
          <section style={{ padding: "56px 0" }}>
            <div className="note" role="alert" style={{ maxWidth: 480 }}>
              {error}
            </div>
            <div style={{ marginTop: 20 }}>
              <Link href="/search" className="btn">
                Back to search
              </Link>
            </div>
          </section>
        )}

        {!loading && !error && album && (
          <>
            {/* ══════════ HERO ══════════ */}
            <section
              style={{
                display: "grid",
                gridTemplateColumns: "0.9fr 1.1fr",
                gap: 48,
                padding: "56px 0 48px",
                alignItems: "start",
              }}
            >
              <AlbumCover
                src={album.images?.[0]?.url}
                alt={`${album.name} cover`}
              />
              <div>
                <div className="eyebrow" style={{ marginBottom: 16 }}>
                  {album.artists.join(", ")}
                </div>
                <h1
                  className="display"
                  style={{
                    fontSize: "clamp(48px, 6vw, 92px)",
                    lineHeight: 0.95,
                    margin: 0,
                  }}
                >
                  {album.name}
                </h1>
                <div
                  className="eyebrow"
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 18,
                    marginTop: 24,
                  }}
                >
                  <span>
                    {album.release_date
                      ? album.release_date.slice(0, 4)
                      : "—"}
                  </span>
                  <span>·</span>
                  <span>
                    {album.total_tracks} track
                    {album.total_tracks === 1 ? "" : "s"}
                  </span>
                  {album.label && (
                    <>
                      <span>·</span>
                      <span>{album.label}</span>
                    </>
                  )}
                </div>
                {album.genres?.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                      marginTop: 16,
                    }}
                  >
                    {album.genres.map((genre) => (
                      <span
                        key={genre}
                        className="eyebrow"
                        style={{
                          border: "1px solid var(--line-strong)",
                          padding: "4px 10px",
                        }}
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                )}

                {/* average + distribution */}
                <div style={{ marginTop: 32 }}>
                  {reviews.length === 0 ? (
                    <p className="pull" style={{ fontSize: 20, color: "var(--muted)" }}>
                      No ratings yet — be the first below.
                    </p>
                  ) : (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "auto 1fr",
                        gap: 32,
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div
                          className="display"
                          style={{ fontSize: 72, lineHeight: 1 }}
                        >
                          {averageRating}
                        </div>
                        <div style={{ marginTop: 6 }}>
                          <Stars
                            value={rating10ToStars(Number(averageRating))}
                            size={16}
                          />
                        </div>
                        <div className="eyebrow" style={{ marginTop: 6 }}>
                          {reviews.length} rating
                          {reviews.length === 1 ? "" : "s"} · out of 10
                        </div>
                      </div>
                      <div style={{ display: "grid", gap: 4 }}>
                        {Array.from({ length: 10 }, (_, idx) => 10 - idx).map(
                          (score) => {
                            const count = ratingDistribution[score - 1] || 0;
                            const width = `${(count / maxCount) * 100}%`;
                            return (
                              <div
                                key={score}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 10,
                                }}
                              >
                                <span
                                  className="eyebrow"
                                  style={{ width: 16, textAlign: "right" }}
                                >
                                  {score}
                                </span>
                                <div
                                  style={{
                                    flex: 1,
                                    height: 8,
                                    background: "var(--bg-strong)",
                                  }}
                                >
                                  <div
                                    style={{
                                      width,
                                      height: "100%",
                                      background: "var(--accent)",
                                    }}
                                  />
                                </div>
                                <span
                                  className="eyebrow"
                                  style={{ width: 20, textAlign: "right" }}
                                >
                                  {count}
                                </span>
                              </div>
                            );
                          }
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* ══════════ TRACKLIST ══════════ */}
            {album.tracks?.length > 0 && (
              <section style={sectionStyle}>
                <SectionHead
                  title="Tracklist"
                  emph="Tracklist"
                  count={`${album.tracks.length} track${
                    album.tracks.length === 1 ? "" : "s"
                  }`}
                />
                <div style={{ display: "grid", gap: 0 }}>
                  {album.tracks.map((track, i) => (
                    <div
                      key={track.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "40px 1fr auto auto",
                        gap: 20,
                        alignItems: "center",
                        padding: "12px 0",
                        borderTop:
                          i === 0
                            ? "1px solid var(--ink)"
                            : "1px solid var(--line)",
                        borderBottom:
                          i === album.tracks.length - 1
                            ? "1px solid var(--ink)"
                            : undefined,
                      }}
                    >
                      <span
                        className="display"
                        style={{ fontSize: 22, fontStyle: "italic" }}
                      >
                        {track.track_number}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>
                        {track.name}
                      </span>
                      <span className="eyebrow" style={{ color: "var(--muted-2)" }}>
                        {formatDuration(track.duration_ms)}
                      </span>
                      {track.preview_url ? (
                        <button
                          type="button"
                          onClick={() =>
                            togglePreview(track.id, track.preview_url!)
                          }
                          className="eyebrow"
                          style={{
                            color: "var(--ink)",
                            background: "none",
                            border: "none",
                            borderBottom: "1px solid var(--ink)",
                            padding: 0,
                            cursor: "pointer",
                            font: "inherit",
                          }}
                        >
                          {playingTrackId === track.id ? "Pause ❚❚" : "Preview ▶"}
                        </button>
                      ) : (
                        <span className="eyebrow" style={{ color: "var(--muted-2)" }}>
                          No preview
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <audio
                  ref={audioRef}
                  onEnded={() => setPlayingTrackId(null)}
                  style={{ display: "none" }}
                />
              </section>
            )}
          </>
        )}

        {/* ══════════ REVIEWS ══════════ */}
        {!loading && !error && album && (
          <section style={sectionStyle}>
            <SectionHead
              title="Ratings & reviews"
              emph="reviews"
              count={
                averageRating
                  ? `Avg ${averageRating} · ${reviews.length} review${
                      reviews.length === 1 ? "" : "s"
                    }`
                  : "No reviews yet"
              }
            />

            {/* compose */}
            {user && myReview ? (
              <div
                style={{
                  display: "grid",
                  gap: 8,
                  marginBottom: 40,
                  paddingBottom: 32,
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <div
                  className="display"
                  style={{ fontSize: 28 }}
                >
                  You&rsquo;ve <em>already</em> reviewed this album
                </div>
                <p
                  className="eyebrow"
                  style={{ color: "var(--accent)" }}
                >
                  Edit or delete your review below ↓
                </p>
              </div>
            ) : (
              <form
              onSubmit={handleReviewSubmit}
              style={{
                display: "grid",
                gap: 18,
                marginBottom: 40,
                paddingBottom: 32,
                borderBottom: "1px solid var(--line)",
              }}
            >
              <div
                className="display"
                style={{ fontSize: 28, fontStyle: "italic" }}
              >
                {user ? "Log your listen" : "Sign in to leave a review"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span className="eyebrow">Rating</span>
                <select
                  className="field-line"
                  style={{ fontSize: 18, paddingRight: 24 }}
                  value={ratingValue}
                  onChange={(event) => setRatingValue(event.target.value)}
                  disabled={!user}
                >
                  {Array.from({ length: 10 }, (_, idx) => String(idx + 1)).map(
                    (value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    )
                  )}
                </select>
                <span className="eyebrow">/ 10</span>
                <Stars value={rating10ToStars(Number(ratingValue))} size={18} />
              </div>
              <textarea
                className="field-line"
                style={{ minHeight: 64, resize: "vertical" }}
                placeholder="Write your review (optional)"
                value={bodyValue}
                onChange={(event) => setBodyValue(event.target.value)}
                disabled={!user}
              />
              {reviewError && <div className="note">{reviewError}</div>}
              <div>
                {user ? (
                  <button type="submit" className="text-btn" disabled={submitting}>
                    {submitting ? (
                      "Posting…"
                    ) : (
                      <>
                        Post review
                        <span aria-hidden="true">→</span>
                      </>
                    )}
                  </button>
                ) : (
                  <a
                    className="btn primary"
                    href={`${apiUrl}/auth/spotify`}
                    style={{ gap: 8 }}
                  >
                    Continue with Spotify
                    <span aria-hidden="true">→</span>
                  </a>
                )}
              </div>
            </form>
            )}

            {/* list */}
            {reviewActionError && (
              <div className="note" style={{ marginBottom: 20 }}>
                {reviewActionError}
              </div>
            )}
            {reviewsLoading && (
              <div className="eyebrow">Loading reviews…</div>
            )}
            {!reviewsLoading && reviews.length === 0 && (
              <p className="pull" style={{ fontSize: 20, color: "var(--muted)" }}>
                No reviews yet. Be the first to write one.
              </p>
            )}

            <div style={{ display: "grid", gap: 0 }}>
              {reviews.map((review, i) => {
                const isEditing = editingReviewId === review.id;
                const isOwner = user && review.user?.id === user.id;
                return (
                  <article
                    key={review.id}
                    style={{
                      padding: "24px 0",
                      borderTop:
                        i === 0 ? "1px solid var(--ink)" : "1px solid var(--line)",
                      borderBottom:
                        i === reviews.length - 1
                          ? "1px solid var(--ink)"
                          : undefined,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        gap: 16,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 14, fontWeight: 500 }}>
                          {review.user.display_name || review.user.spotify_id}
                        </span>
                        {review.is_pinned && (
                          <span className="eyebrow" style={{ color: "var(--accent)" }}>
                            Pinned
                          </span>
                        )}
                      </div>
                      <span className="eyebrow">
                        {formatDate(review.created_at)}
                      </span>
                    </div>

                    {isEditing ? (
                      <div style={{ marginTop: 16, display: "grid", gap: 18, maxWidth: 560 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                          <span className="eyebrow">Rating</span>
                          <select
                            className="field-line"
                            style={{ fontSize: 18, paddingRight: 24 }}
                            value={editRatingValue}
                            onChange={(event) =>
                              setEditRatingValue(event.target.value)
                            }
                          >
                            {Array.from({ length: 10 }, (_, idx) =>
                              String(idx + 1)
                            ).map((value) => (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            ))}
                          </select>
                          <span className="eyebrow">/ 10</span>
                          <Stars
                            value={rating10ToStars(Number(editRatingValue))}
                            size={18}
                          />
                        </div>
                        <textarea
                          className="field-line"
                          style={{ minHeight: 64, resize: "vertical" }}
                          placeholder="Write your review (optional)"
                          value={editBodyValue}
                          onChange={(event) => setEditBodyValue(event.target.value)}
                        />
                        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                          <button
                            type="button"
                            className="text-btn"
                            onClick={() => handleReviewUpdate(review.id)}
                            disabled={reviewSaving}
                          >
                            {reviewSaving ? (
                              "Saving…"
                            ) : (
                              <>
                                Save changes
                                <span aria-hidden="true">→</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            className="text-btn"
                            style={{ color: "var(--muted)" }}
                            onClick={() => setEditingReviewId(null)}
                            disabled={reviewSaving}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            marginTop: 12,
                          }}
                        >
                          <Stars value={rating10ToStars(review.rating)} />
                          <span className="eyebrow">{review.rating}/10</span>
                        </div>
                        {review.body && (
                          <p
                            className="pull"
                            style={{ fontSize: 20, marginTop: 12, color: "var(--ink)" }}
                          >
                            &ldquo;{review.body}&rdquo;
                          </p>
                        )}
                        {isOwner && (
                          <div
                            className="eyebrow"
                            style={{ display: "flex", gap: 16, marginTop: 14 }}
                          >
                            <button
                              type="button"
                              onClick={() => startEditReview(review)}
                              className="eyebrow"
                              style={{
                                cursor: "pointer",
                                color: "var(--ink)",
                                borderBottom: "1px solid var(--ink)",
                              }}
                            >
                              Edit →
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleReviewPin(review.id, !review.is_pinned)
                              }
                              disabled={reviewPinning === review.id}
                              className="eyebrow"
                              style={{
                                cursor: "pointer",
                                color: "var(--ink)",
                                borderBottom: "1px solid var(--ink)",
                              }}
                            >
                              {reviewPinning === review.id
                                ? "Saving…"
                                : review.is_pinned
                                  ? "Unpin"
                                  : "Pin"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReviewDelete(review.id)}
                              disabled={reviewDeleting === review.id}
                              className="eyebrow"
                              style={{ cursor: "pointer", color: "var(--accent)" }}
                            >
                              {reviewDeleting === review.id ? "Deleting…" : "Delete"}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </Shell>
  );
}
