"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
  spotify_album_id: string;
  rating: number;
  body: string | null;
  created_at: string;
  is_pinned?: boolean;
  pinned_at?: string | null;
};

type ListItem = {
  spotify_album_id: string;
  created_at: string;
  position?: number;
};

type List = {
  id: number;
  title: string;
  description: string | null;
  created_at: string;
  is_ranked: boolean;
  likes_count?: number;
  liked_by_me?: boolean;
  tags?: string[];
  items: ListItem[];
};

type AlbumCard = {
  id: string;
  name: string;
  artists: string[];
  image: string | null;
};

type ArtistCard = {
  id: string;
  name: string;
  image: string | null;
  genres: string[];
};

type Profile = {
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  favorite_genres: string[];
  favorite_album_ids: string[];
  favorite_artist_ids: string[];
};

type SearchAlbum = {
  id: string;
  name: string;
  artists: string[];
  image: string | null;
  release_date: string;
};

type SearchArtist = {
  id: string;
  name: string;
  image: string | null;
  genres: string[];
};

type UserSummary = {
  id: number;
  spotify_id: string;
  display_name: string | null;
  avatar_url: string | null;
};

export default function ProfilePage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [albumMap, setAlbumMap] = useState<Record<string, AlbumCard>>({});
  const [artistMap, setArtistMap] = useState<Record<string, ArtistCard>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lists, setLists] = useState<List[]>([]);
  const [listsLoading, setListsLoading] = useState(true);
  const [listsError, setListsError] = useState<string | null>(null);
  const [listActionError, setListActionError] = useState<string | null>(null);
  const [listDeleting, setListDeleting] = useState<number | null>(null);
  const [followSearch, setFollowSearch] = useState("");
  const [followResults, setFollowResults] = useState<UserSummary[]>([]);
  const [followSearching, setFollowSearching] = useState(false);
  const [followError, setFollowError] = useState<string | null>(null);
  const [followActionError, setFollowActionError] = useState<string | null>(null);
  const [followUpdatingId, setFollowUpdatingId] = useState<number | null>(null);
  const [followers, setFollowers] = useState<UserSummary[]>([]);
  const [following, setFollowing] = useState<UserSummary[]>([]);
  const [followersLoading, setFollowersLoading] = useState(false);
  const [followingLoading, setFollowingLoading] = useState(false);
  const [followingIds, setFollowingIds] = useState<number[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [genresInput, setGenresInput] = useState("");
  const [favoriteAlbumIds, setFavoriteAlbumIds] = useState<string[]>([]);
  const [favoriteQuery, setFavoriteQuery] = useState("");
  const [favoriteSuggestions, setFavoriteSuggestions] = useState<SearchAlbum[]>([]);
  const [favoriteSearching, setFavoriteSearching] = useState(false);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const [favoriteArtistIds, setFavoriteArtistIds] = useState<string[]>([]);
  const [favoriteArtistQuery, setFavoriteArtistQuery] = useState("");
  const [favoriteArtistSuggestions, setFavoriteArtistSuggestions] = useState<SearchArtist[]>([]);
  const [favoriteArtistSearching, setFavoriteArtistSearching] = useState(false);
  const [favoriteArtistError, setFavoriteArtistError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingReviewId, setEditingReviewId] = useState<number | null>(null);
  const [editRatingValue, setEditRatingValue] = useState("8");
  const [editBodyValue, setEditBodyValue] = useState("");
  const [reviewActionError, setReviewActionError] = useState<string | null>(null);
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

  const parsedGenres = useMemo(() => {
    return genresInput
      .split(",")
      .map((genre) => genre.trim())
      .filter((genre) => genre.length > 0);
  }, [genresInput]);

  // only reviews the user has actually pinned, most recently pinned first
  const pinnedColumns = useMemo(() => {
    return reviews
      .filter((review) => review.is_pinned)
      .sort((a, b) => {
        const aTime = a.pinned_at ? new Date(a.pinned_at).getTime() : 0;
        const bTime = b.pinned_at ? new Date(b.pinned_at).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 3);
  }, [reviews]);

  const recentReviews = useMemo(
    () =>
      [...reviews].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [reviews]
  );

  const totalThisYear = useMemo(
    () =>
      reviews.filter(
        (review) =>
          new Date(review.created_at).getFullYear() === new Date().getFullYear()
      ).length,
    [reviews]
  );

  const highRatedCount = useMemo(
    () => reviews.filter((review) => review.rating >= 9).length,
    [reviews]
  );

  // Year-in-listening cells: 53 weeks x 7 days, tinted by day's log count
  const yearCells = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const jan1 = new Date(year, 0, 1);
    const counts: Record<string, number> = {};
    for (const review of reviews) {
      const d = new Date(review.created_at);
      if (d.getFullYear() !== year) continue;
      const key = `${d.getMonth()}-${d.getDate()}`;
      counts[key] = (counts[key] || 0) + 1;
    }
    const cells: { level: number; date: Date }[] = [];
    for (let w = 0; w < 53; w++) {
      for (let d = 0; d < 7; d++) {
        const day = new Date(jan1);
        day.setDate(jan1.getDate() + w * 7 + d - jan1.getDay());
        const key = `${day.getMonth()}-${day.getDate()}`;
        const count = counts[key] || 0;
        const level =
          count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : count <= 4 ? 3 : 4;
        cells.push({ level, date: day });
      }
    }
    return cells;
  }, [reviews]);

  const yearShades = [
    "var(--bg-strong)",
    "#e4d6b8",
    "#c9a36a",
    "#8a6a3a",
    "#3a2a1a",
  ];

  const avatarInitial = (
    displayName || user?.spotify_id || "J"
  ).charAt(0).toUpperCase();
  const profileDisplayName =
    profile?.display_name || user?.display_name || user?.spotify_id || "You";
  const profileGenres = profile?.favorite_genres || [];
  const profileFavorites = profile?.favorite_album_ids || [];
  const profileFavoriteArtists = profile?.favorite_artist_ids || [];
  const profileBio = profile?.bio || "";

  function getUserInitial(person: UserSummary) {
    return (person.display_name || person.spotify_id || "U")
      .charAt(0)
      .toUpperCase();
  }

  function getUserLabel(person: UserSummary) {
    return person.display_name || person.spotify_id;
  }

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
    let cancelled = false;

    async function loadProfile() {
      if (!user) {
        setProfile(null);
        setProfileLoading(false);
        return;
      }

      setProfileLoading(true);
      setProfileError(null);
      try {
        const response = await fetch(`${apiUrl}/me/profile`, {
          credentials: "include",
        });

        if (response.status === 401) {
          if (!cancelled) {
            setProfile(null);
          }
          return;
        }

        const data = await response.json();
        if (!cancelled) {
          const nextProfile = data.profile || null;
          setProfile(nextProfile);
          setDisplayName(nextProfile?.display_name || "");
          setBio(nextProfile?.bio || "");
          setGenresInput(nextProfile?.favorite_genres?.join(", ") || "");
          setFavoriteAlbumIds(nextProfile?.favorite_album_ids || []);
          setFavoriteArtistIds(nextProfile?.favorite_artist_ids || []);
          setAvatarUrl(nextProfile?.avatar_url || null);
        }
      } catch {
        if (!cancelled) {
          setProfileError("Could not load profile.");
        }
      } finally {
        if (!cancelled) {
          setProfileLoading(false);
        }
      }
    }

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, user]);

  useEffect(() => {
    let cancelled = false;

    async function loadReviews() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`${apiUrl}/me/reviews`, {
          credentials: "include",
        });

        if (response.status === 401) {
          if (!cancelled) {
            setReviews([]);
          }
          return;
        }

        const data = await response.json();
        if (!cancelled) {
          setReviews(Array.isArray(data.reviews) ? data.reviews : []);
        }
      } catch {
        if (!cancelled) {
          setError("Could not load reviews.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadReviews();
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  useEffect(() => {
    let cancelled = false;

    async function loadLists() {
      setListsLoading(true);
      setListsError(null);

      try {
        const response = await fetch(`${apiUrl}/me/lists`, {
          credentials: "include",
        });

        if (response.status === 401) {
          if (!cancelled) {
            setLists([]);
          }
          return;
        }

        const data = await response.json();
        if (!cancelled) {
          setLists(Array.isArray(data.lists) ? data.lists : []);
        }
      } catch {
        if (!cancelled) {
          setListsError("Could not load lists.");
        }
      } finally {
        if (!cancelled) {
          setListsLoading(false);
        }
      }
    }

    loadLists();
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  useEffect(() => {
    let cancelled = false;

    async function loadFollows() {
      if (!user) {
        setFollowers([]);
        setFollowing([]);
        setFollowingIds([]);
        return;
      }

      setFollowersLoading(true);
      setFollowingLoading(true);
      setFollowActionError(null);
      try {
        const [followersResponse, followingResponse] = await Promise.all([
          fetch(`${apiUrl}/users/${user.id}/followers?limit=12`, {
            credentials: "include",
          }),
          fetch(`${apiUrl}/users/${user.id}/following?limit=12`, {
            credentials: "include",
          }),
        ]);

        const followersData = await followersResponse.json().catch(() => null);
        const followingData = await followingResponse.json().catch(() => null);

        if (!cancelled) {
          const nextFollowers = Array.isArray(followersData?.followers)
            ? followersData.followers
            : [];
          const nextFollowing = Array.isArray(followingData?.following)
            ? followingData.following
            : [];
          setFollowers(nextFollowers);
          setFollowing(nextFollowing);
          setFollowingIds(nextFollowing.map((person: UserSummary) => person.id));
        }
      } catch {
        if (!cancelled) {
          setFollowActionError("Could not load follow data.");
        }
      } finally {
        if (!cancelled) {
          setFollowersLoading(false);
          setFollowingLoading(false);
        }
      }
    }

    loadFollows();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, user]);

  useEffect(() => {
    if (followSearch.trim().length < 2) {
      setFollowResults([]);
      setFollowError(null);
      return;
    }

    const timeout = setTimeout(async () => {
      setFollowSearching(true);
      setFollowError(null);
      try {
        const response = await fetch(
          `${apiUrl}/users/search?query=${encodeURIComponent(
            followSearch.trim()
          )}&limit=6`,
          { credentials: "include" }
        );

        if (!response.ok) {
          setFollowError("Could not search users.");
          setFollowResults([]);
          return;
        }

        const data = await response.json();
        setFollowResults(Array.isArray(data.users) ? data.users : []);
      } catch {
        setFollowError("Could not search users.");
        setFollowResults([]);
      } finally {
        setFollowSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [apiUrl, followSearch]);

  useEffect(() => {
    if (favoriteQuery.trim().length < 2) {
      setFavoriteSuggestions([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setFavoriteSearching(true);
      try {
        const response = await fetch(
          `${apiUrl}/spotify/search?query=${encodeURIComponent(
            favoriteQuery.trim()
          )}&limit=5`,
          { credentials: "include" }
        );
        const data = await response.json();
        setFavoriteSuggestions(Array.isArray(data.albums) ? data.albums : []);
      } catch {
        setFavoriteSuggestions([]);
      } finally {
        setFavoriteSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [apiUrl, favoriteQuery]);

  useEffect(() => {
    if (favoriteArtistQuery.trim().length < 2) {
      setFavoriteArtistSuggestions([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setFavoriteArtistSearching(true);
      try {
        const response = await fetch(
          `${apiUrl}/spotify/artists/search?query=${encodeURIComponent(
            favoriteArtistQuery.trim()
          )}&limit=5`,
          { credentials: "include" }
        );
        const data = await response.json();
        setFavoriteArtistSuggestions(
          Array.isArray(data.artists) ? data.artists : []
        );
      } catch {
        setFavoriteArtistSuggestions([]);
      } finally {
        setFavoriteArtistSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [apiUrl, favoriteArtistQuery]);

  useEffect(() => {
    let cancelled = false;

    async function loadAlbums() {
      const reviewIds = reviews.map((review) => review.spotify_album_id);
      const listIds = lists.flatMap((list) =>
        list.items.map((item) => item.spotify_album_id)
      );
      const favoriteIds = favoriteAlbumIds;

      const validIds = Array.from(
        new Set([...reviewIds, ...listIds, ...favoriteIds])
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
      } catch {
        // ignore album enrichment errors
      }
    }

    loadAlbums();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, reviews, lists, favoriteAlbumIds, albumMap]);

  useEffect(() => {
    let cancelled = false;

    async function loadArtists() {
      if (favoriteArtistIds.length === 0) {
        return;
      }

      const validIds = Array.from(new Set(favoriteArtistIds)).filter((id) =>
        /^[A-Za-z0-9]{22}$/.test(id)
      );

      const uniqueIds = validIds.filter((id) => !artistMap[id]);

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
            fetch(`${apiUrl}/spotify/artists?ids=${chunk.join(",")}`, {
              credentials: "include",
            })
          )
        );

        const artists = await Promise.all(
          responses.map(async (response) => {
            if (!response.ok) {
              return [];
            }
            const data = await response.json();
            return Array.isArray(data.artists) ? data.artists : [];
          })
        );

        if (!cancelled) {
          setArtistMap((prev) => {
            const next = { ...prev };
            artists.flat().forEach((artist) => {
              if (!artist) {
                return;
              }
              next[artist.id] = {
                id: artist.id,
                name: artist.name,
                image: artist.images?.[1]?.url || artist.images?.[0]?.url || null,
                genres: artist.genres || [],
              };
            });
            return next;
          });
        }
      } catch {
        // ignore artist enrichment errors
      }
    }

    loadArtists();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, favoriteArtistIds, artistMap]);

  async function handleLogout() {
    await fetch(`${apiUrl}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    setUser(null);
  }

  async function handleProfileSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      return;
    }

    const genres = parsedGenres.slice(0, 10);
    if (parsedGenres.length > 10) {
      setProfileError("Limit favorite genres to 10.");
      return;
    }

    if (favoriteAlbumIds.length > 4) {
      setProfileError("Pick up to 4 favorite albums.");
      return;
    }

    if (favoriteArtistIds.length > 5) {
      setProfileError("Pick up to 5 favorite artists.");
      return;
    }

    setProfileSaving(true);
    setProfileError(null);
    try {
      const response = await fetch(`${apiUrl}/me/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          display_name: displayName.trim() || null,
          bio: bio.trim() || null,
          favorite_genres: genres,
          favorite_album_ids: favoriteAlbumIds,
          favorite_artist_ids: favoriteArtistIds,
        }),
      });

      if (response.status === 401) {
        setProfileError("Sign in to update your profile.");
        return;
      }

      if (!response.ok) {
        setProfileError("Could not update profile.");
        return;
      }

      const data = await response.json();
      const nextProfile = data.profile || null;
      setProfile(nextProfile);
      setDisplayName(nextProfile?.display_name || "");
      setBio(nextProfile?.bio || "");
      setGenresInput(nextProfile?.favorite_genres?.join(", ") || "");
      setFavoriteAlbumIds(nextProfile?.favorite_album_ids || []);
      setFavoriteArtistIds(nextProfile?.favorite_artist_ids || []);
      setAvatarUrl(nextProfile?.avatar_url || avatarUrl);
      setUser((prev) =>
        prev
          ? {
              ...prev,
              display_name: nextProfile?.display_name || prev.display_name,
            }
          : prev
      );
      setEditingProfile(false);
    } catch {
      setProfileError("Could not update profile.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleAvatarUpload(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setAvatarUploading(true);
    setProfileError(null);
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      const response = await fetch(`${apiUrl}/me/avatar`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (response.status === 401) {
        setProfileError("Sign in to update your photo.");
        return;
      }

      if (!response.ok) {
        setProfileError("Could not upload photo.");
        return;
      }

      const data = await response.json();
      if (data.avatar_url) {
        setAvatarUrl(data.avatar_url);
        setProfile((prev) =>
          prev ? { ...prev, avatar_url: data.avatar_url } : prev
        );
      }
    } catch {
      setProfileError("Could not upload photo.");
    } finally {
      setAvatarUploading(false);
      event.target.value = "";
    }
  }

  function handleFavoriteAdd(album: SearchAlbum) {
    setFavoriteError(null);
    if (favoriteAlbumIds.includes(album.id)) {
      return;
    }
    if (favoriteAlbumIds.length >= 4) {
      setFavoriteError("You can only pick 4 favorite albums.");
      return;
    }
    setFavoriteAlbumIds((prev) => [...prev, album.id]);
    setFavoriteQuery("");
    setFavoriteSuggestions([]);
  }

  function handleFavoriteRemove(albumId: string) {
    setFavoriteAlbumIds((prev) => prev.filter((id) => id !== albumId));
  }

  function handleFavoriteArtistAdd(artist: SearchArtist) {
    setFavoriteArtistError(null);
    if (favoriteArtistIds.includes(artist.id)) {
      return;
    }
    if (favoriteArtistIds.length >= 5) {
      setFavoriteArtistError("You can only pick 5 favorite artists.");
      return;
    }
    setFavoriteArtistIds((prev) => [...prev, artist.id]);
    setFavoriteArtistQuery("");
    setFavoriteArtistSuggestions([]);
  }

  function handleFavoriteArtistRemove(artistId: string) {
    setFavoriteArtistIds((prev) => prev.filter((id) => id !== artistId));
  }

  function handleEditToggle(nextValue: boolean) {
    if (!nextValue && profile) {
      setDisplayName(profile.display_name || "");
      setBio(profile.bio || "");
      setGenresInput(profile.favorite_genres?.join(", ") || "");
      setFavoriteAlbumIds(profile.favorite_album_ids || []);
      setFavoriteArtistIds(profile.favorite_artist_ids || []);
      setAvatarUrl(profile.avatar_url || null);
      setFavoriteQuery("");
      setFavoriteSuggestions([]);
      setFavoriteError(null);
      setFavoriteArtistQuery("");
      setFavoriteArtistSuggestions([]);
      setFavoriteArtistError(null);
      setProfileError(null);
    }
    setEditingProfile(nextValue);
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
          setReviewActionError("You can only pin 3 reviews.");
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

  async function handleDeleteList(listId: number) {
    if (!window.confirm("Delete this list?")) {
      return;
    }

    setListDeleting(listId);
    setListActionError(null);
    try {
      const response = await fetch(`${apiUrl}/lists/${listId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.status === 401) {
        setListActionError("Sign in to delete lists.");
        return;
      }

      if (!response.ok) {
        setListActionError("Could not delete list.");
        return;
      }

      setLists((prev) => prev.filter((list) => list.id !== listId));
    } catch {
      setListActionError("Could not delete list.");
    } finally {
      setListDeleting(null);
    }
  }

  async function handleFollowUser(targetId: number) {
    setFollowUpdatingId(targetId);
    setFollowActionError(null);
    try {
      const response = await fetch(`${apiUrl}/users/${targetId}/follow`, {
        method: "POST",
        credentials: "include",
      });

      if (response.status === 401) {
        setFollowActionError("Sign in to follow users.");
        return;
      }

      if (!response.ok) {
        setFollowActionError("Could not follow user.");
        return;
      }

      setFollowingIds((prev) =>
        prev.includes(targetId) ? prev : [...prev, targetId]
      );

      const target =
        followResults.find((person) => person.id === targetId) ||
        followers.find((person) => person.id === targetId);
      if (target) {
        setFollowing((prev) =>
          prev.some((person) => person.id === targetId)
            ? prev
            : [target, ...prev]
        );
      }
    } catch {
      setFollowActionError("Could not follow user.");
    } finally {
      setFollowUpdatingId(null);
    }
  }

  async function handleUnfollowUser(targetId: number) {
    setFollowUpdatingId(targetId);
    setFollowActionError(null);
    try {
      const response = await fetch(`${apiUrl}/users/${targetId}/follow`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.status === 401) {
        setFollowActionError("Sign in to unfollow users.");
        return;
      }

      if (!response.ok) {
        setFollowActionError("Could not unfollow user.");
        return;
      }

      setFollowingIds((prev) => prev.filter((id) => id !== targetId));
      setFollowing((prev) => prev.filter((person) => person.id !== targetId));
    } catch {
      setFollowActionError("Could not unfollow user.");
    } finally {
      setFollowUpdatingId(null);
    }
  }

  const sectionStyle: React.CSSProperties = {
    padding: "48px 0",
    borderTop: "1px solid var(--ink)",
  };

  function personRow(person: UserSummary, action: React.ReactNode) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 0",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              overflow: "hidden",
              background: "var(--bg-strong)",
              flexShrink: 0,
            }}
          >
            {person.avatar_url ? (
              <img
                src={person.avatar_url}
                alt={getUserLabel(person)}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <div
                className="eyebrow"
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {getUserInitial(person)}
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>
              {getUserLabel(person)}
            </div>
            <div className="eyebrow">{person.spotify_id}</div>
          </div>
        </div>
        {action}
      </div>
    );
  }

  return (
    <Shell
      user={user}
      reviewCount={user ? reviews.length : undefined}
      followerCount={user ? followers.length : undefined}
      onLogout={handleLogout}
    >
      <main style={{ maxWidth: 1320, margin: "0 auto", padding: "0 40px" }}>
        {!authChecked && (
          <div className="eyebrow" style={{ padding: "48px 0" }}>
            Checking session…
          </div>
        )}

        {authChecked && !user && (
          <section style={{ padding: "72px 0" }}>
            <h1
              className="display"
              style={{ fontSize: "clamp(48px, 6vw, 88px)", margin: 0 }}
            >
              Sign in to <em>keep score.</em>
            </h1>
            <p className="pull" style={{ fontSize: 22, marginTop: 20, maxWidth: 480 }}>
              Your reviews, ranked lists, and listening year live here.
            </p>
            <div style={{ marginTop: 28 }}>
              <a className="btn primary" href={`${apiUrl}/auth/spotify`}>
                Continue with Spotify
              </a>
            </div>
          </section>
        )}

        {user && (
          <>
            {/* ══ HEAD ══ */}
            <section
              style={{
                display: "grid",
                gridTemplateColumns: "1.1fr 1fr",
                gap: 48,
                padding: "48px 0 32px",
                alignItems: "end",
              }}
            >
              <div>
                <div className="eyebrow" style={{ marginBottom: 16 }}>
                  @{user.spotify_id}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 72,
                    alignItems: "flex-end",
                  }}
                >
                  <div
                    style={{
                      flexShrink: 0,
                      width: "clamp(120px, 11vw, 184px)",
                      height: "clamp(120px, 11vw, 184px)",
                      overflow: "hidden",
                      background: "var(--bg-strong)",
                      border: "1px solid var(--ink)",
                    }}
                  >
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt="Profile avatar"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <div
                        className="display"
                        style={{
                          width: "100%",
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 72,
                          fontStyle: "italic",
                          color: "var(--muted)",
                        }}
                      >
                        {avatarInitial}
                      </div>
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <h1
                      className="display"
                      style={{
                        fontSize: "clamp(72px, 9vw, 128px)",
                        lineHeight: 0.9,
                        letterSpacing: "-0.025em",
                        margin: 0,
                      }}
                    >
                      {profileDisplayName.split(" ").map((word, i, arr) => (
                        <span key={i}>
                          {i === arr.length - 1 && arr.length > 1 ? (
                            <em>{word}.</em>
                          ) : (
                            <>
                              {word}
                              {i < arr.length - 1 ? <br /> : null}
                            </>
                          )}
                        </span>
                      ))}
                    </h1>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 20, marginTop: 20, alignItems: "center" }}>
                  <button
                    type="button"
                    className="quiet-link"
                    onClick={() => handleEditToggle(!editingProfile)}
                  >
                    {editingProfile ? (
                      "Cancel editing"
                    ) : (
                      <>
                        Edit profile
                        <span aria-hidden="true">→</span>
                      </>
                    )}
                  </button>
                  <Link href="/search" className="quiet-link">
                    Log a listen
                    <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </div>
              <div>
                <p className="pull" style={{ fontSize: 22, maxWidth: 440 }}>
                  {profileBio || "Add a bio to share your listening style."}
                </p>
                <div
                  className="eyebrow"
                  style={{
                    display: "flex",
                    gap: 24,
                    marginTop: 20,
                    flexWrap: "wrap",
                  }}
                >
                  <span>
                    <b style={{ color: "var(--ink)", fontWeight: 500 }}>
                      {totalThisYear}
                    </b>{" "}
                    this yr
                  </span>
                  <span>
                    <b style={{ color: "var(--ink)", fontWeight: 500 }}>
                      {highRatedCount}
                    </b>{" "}
                    five-stars
                  </span>
                  <span>
                    <b style={{ color: "var(--ink)", fontWeight: 500 }}>
                      {averageRating ?? "—"}
                    </b>{" "}
                    avg
                  </span>
                  <span>
                    <b style={{ color: "var(--ink)", fontWeight: 500 }}>
                      {lists.length}
                    </b>{" "}
                    lists
                  </span>
                </div>
              </div>
            </section>

            {/* ══ EDITOR (progressive disclosure) ══ */}
            {editingProfile && !profileLoading && (
              <section style={sectionStyle}>
                <SectionHead
                  title="Edit profile"
                  emph="profile"
                  count="Changes save to your public page"
                />
                <form onSubmit={handleProfileSave} style={{ display: "grid", gap: 28 }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "280px 1fr",
                      gap: 40,
                      alignItems: "start",
                    }}
                  >
                    <div style={{ display: "grid", gap: 16 }}>
                      <div>
                        <div className="eyebrow" style={{ marginBottom: 8 }}>
                          Profile photo
                        </div>
                        <button
                          type="button"
                          onClick={() => avatarInputRef.current?.click()}
                          disabled={avatarUploading}
                          aria-label="Change profile photo"
                          style={{
                            width: 120,
                            height: 120,
                            overflow: "hidden",
                            background: "var(--bg-strong)",
                            marginBottom: 10,
                            padding: 0,
                            border: "1px solid var(--line-strong)",
                            cursor: avatarUploading ? "default" : "pointer",
                            display: "block",
                          }}
                        >
                          {avatarUrl ? (
                            <img
                              src={avatarUrl}
                              alt="Profile avatar"
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                              }}
                            />
                          ) : (
                            <div
                              className="display"
                              style={{
                                width: "100%",
                                height: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 44,
                                fontStyle: "italic",
                                color: "var(--muted)",
                              }}
                            >
                              {avatarInitial}
                            </div>
                          )}
                        </button>
                        <input
                          ref={avatarInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleAvatarUpload}
                          disabled={avatarUploading}
                          style={{ display: "none" }}
                        />
                        <button
                          type="button"
                          className="text-btn"
                          onClick={() => avatarInputRef.current?.click()}
                          disabled={avatarUploading}
                        >
                          {avatarUploading ? (
                            "Uploading…"
                          ) : (
                            <>
                              {avatarUrl ? "Change photo" : "Upload photo"}
                              <span aria-hidden="true">→</span>
                            </>
                          )}
                        </button>
                      </div>
                      <div>
                        <div className="eyebrow" style={{ marginBottom: 8 }}>
                          Display name
                        </div>
                        <input
                          className="field-line"
                          style={{ width: "100%" }}
                          value={displayName}
                          onChange={(event) => setDisplayName(event.target.value)}
                          placeholder="Your display name"
                        />
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: 20 }}>
                      <div>
                        <div className="eyebrow" style={{ marginBottom: 8 }}>
                          Bio
                        </div>
                        <textarea
                          className="field-line"
                          style={{ width: "100%", minHeight: 110, resize: "vertical" }}
                          placeholder="Tell people about your taste."
                          value={bio}
                          onChange={(event) => setBio(event.target.value)}
                        />
                      </div>

                      <div>
                        <div className="eyebrow" style={{ marginBottom: 8 }}>
                          Favorite genres (comma-separated, up to 10)
                        </div>
                        <input
                          className="field-line"
                          style={{ width: "100%" }}
                          placeholder="R&B, Soul, Jazz"
                          value={genresInput}
                          onChange={(event) => setGenresInput(event.target.value)}
                        />
                        {parsedGenres.length > 0 && (
                          <div
                            className="eyebrow"
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 8,
                              marginTop: 8,
                            }}
                          >
                            {parsedGenres.slice(0, 10).map((genre) => (
                              <span
                                key={genre}
                                style={{
                                  border: "1px solid var(--line-strong)",
                                  padding: "4px 8px",
                                }}
                              >
                                {genre}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="eyebrow" style={{ marginBottom: 8 }}>
                          Favorite artists (up to 5)
                        </div>
                        <input
                          className="field-line"
                          style={{ width: "100%" }}
                          placeholder="Search for favorite artists"
                          value={favoriteArtistQuery}
                          onChange={(event) =>
                            setFavoriteArtistQuery(event.target.value)
                          }
                        />
                        {favoriteArtistSearching && (
                          <div className="eyebrow" style={{ marginTop: 6 }}>
                            Searching…
                          </div>
                        )}
                        {favoriteArtistSuggestions.length > 0 &&
                          favoriteArtistQuery.trim().length > 1 && (
                            <div
                              style={{
                                border: "1px solid var(--line-strong)",
                                borderBottom: 0,
                                marginTop: 8,
                              }}
                            >
                              {favoriteArtistSuggestions.map((artist) => (
                                <button
                                  key={artist.id}
                                  type="button"
                                  onClick={() => handleFavoriteArtistAdd(artist)}
                                  style={{
                                    display: "flex",
                                    width: "100%",
                                    alignItems: "center",
                                    gap: 12,
                                    padding: "8px 12px",
                                    borderBottom: "1px solid var(--line-strong)",
                                    background: "var(--paper)",
                                    textAlign: "left",
                                    cursor: "pointer",
                                  }}
                                >
                                  <span
                                    style={{
                                      width: 36,
                                      height: 36,
                                      overflow: "hidden",
                                      background: "var(--bg-strong)",
                                      flexShrink: 0,
                                    }}
                                  >
                                    {artist.image ? (
                                      <img
                                        src={artist.image}
                                        alt={`${artist.name} portrait`}
                                        style={{
                                          width: "100%",
                                          height: "100%",
                                          objectFit: "cover",
                                        }}
                                      />
                                    ) : null}
                                  </span>
                                  <span>
                                    <span
                                      style={{
                                        display: "block",
                                        fontSize: 13,
                                        fontWeight: 500,
                                      }}
                                    >
                                      {artist.name}
                                    </span>
                                    <span className="eyebrow">
                                      {artist.genres.slice(0, 2).join(", ") ||
                                        "Artist"}
                                    </span>
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        {favoriteArtistError && (
                          <div className="note" style={{ marginTop: 8 }}>
                            {favoriteArtistError}
                          </div>
                        )}
                        {favoriteArtistIds.length > 0 && (
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(5, 1fr)",
                              gap: 12,
                              marginTop: 12,
                            }}
                          >
                            {favoriteArtistIds.map((artistId) => {
                              const artist = artistMap[artistId];
                              return (
                                <div key={artistId}>
                                  <AlbumCover
                                    src={artist?.image}
                                    alt={artist?.name || "Artist"}
                                  />
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "baseline",
                                      marginTop: 6,
                                      gap: 6,
                                    }}
                                  >
                                    <span style={{ fontSize: 12, fontWeight: 500 }}>
                                      {artist?.name || "Artist"}
                                    </span>
                                    <button
                                      type="button"
                                      className="eyebrow"
                                      onClick={() =>
                                        handleFavoriteArtistRemove(artistId)
                                      }
                                      style={{
                                        cursor: "pointer",
                                        borderBottom: "1px solid var(--ink)",
                                      }}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="eyebrow" style={{ marginBottom: 8 }}>
                          Top albums (up to 4)
                        </div>
                        <input
                          className="field-line"
                          style={{ width: "100%" }}
                          placeholder="Search for favorite albums"
                          value={favoriteQuery}
                          onChange={(event) => setFavoriteQuery(event.target.value)}
                        />
                        {favoriteSearching && (
                          <div className="eyebrow" style={{ marginTop: 6 }}>
                            Searching…
                          </div>
                        )}
                        {favoriteSuggestions.length > 0 &&
                          favoriteQuery.trim().length > 1 && (
                            <div
                              style={{
                                border: "1px solid var(--line-strong)",
                                borderBottom: 0,
                                marginTop: 8,
                              }}
                            >
                              {favoriteSuggestions.map((album) => (
                                <button
                                  key={album.id}
                                  type="button"
                                  onClick={() => handleFavoriteAdd(album)}
                                  style={{
                                    display: "flex",
                                    width: "100%",
                                    alignItems: "center",
                                    gap: 12,
                                    padding: "8px 12px",
                                    borderBottom: "1px solid var(--line-strong)",
                                    background: "var(--paper)",
                                    textAlign: "left",
                                    cursor: "pointer",
                                  }}
                                >
                                  <span
                                    style={{
                                      width: 36,
                                      height: 36,
                                      overflow: "hidden",
                                      background: "var(--bg-strong)",
                                      flexShrink: 0,
                                    }}
                                  >
                                    {album.image ? (
                                      <img
                                        src={album.image}
                                        alt={`${album.name} cover`}
                                        style={{
                                          width: "100%",
                                          height: "100%",
                                          objectFit: "cover",
                                        }}
                                      />
                                    ) : null}
                                  </span>
                                  <span>
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
                        {favoriteError && (
                          <div className="note" style={{ marginTop: 8 }}>
                            {favoriteError}
                          </div>
                        )}
                        {favoriteAlbumIds.length > 0 && (
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(4, 1fr)",
                              gap: 12,
                              marginTop: 12,
                            }}
                          >
                            {favoriteAlbumIds.map((albumId) => {
                              const album = albumMap[albumId];
                              return (
                                <div key={albumId}>
                                  <AlbumCover
                                    src={album?.image}
                                    alt={album?.name || "Album"}
                                  />
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "baseline",
                                      marginTop: 6,
                                      gap: 6,
                                    }}
                                  >
                                    <span style={{ fontSize: 12, fontWeight: 500 }}>
                                      {album?.name || "Album"}
                                    </span>
                                    <button
                                      type="button"
                                      className="eyebrow"
                                      onClick={() => handleFavoriteRemove(albumId)}
                                      style={{
                                        cursor: "pointer",
                                        borderBottom: "1px solid var(--ink)",
                                      }}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {profileError && <div className="note">{profileError}</div>}

                  <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                    <button type="submit" className="text-btn" disabled={profileSaving}>
                      {profileSaving ? (
                        "Saving…"
                      ) : (
                        <>
                          Save profile
                          <span aria-hidden="true">→</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      className="text-btn"
                      style={{ color: "var(--muted)" }}
                      onClick={() => handleEditToggle(false)}
                      disabled={profileSaving}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </section>
            )}

            {/* ══ STATS BAR ══ */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                borderTop: "1px solid var(--ink)",
                borderBottom: "1px solid var(--ink)",
              }}
            >
              {[
                { n: reviews.length.toLocaleString(), l: "Reviews" },
                { n: followers.length.toLocaleString(), l: "Followers" },
                { n: following.length.toLocaleString(), l: "Following" },
              ].map((stat, i) => (
                <div
                  key={stat.l}
                  style={{
                    padding: "18px 20px",
                    borderRight: i < 2 ? "1px solid var(--line)" : undefined,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <div className="display" style={{ fontSize: 44, margin: 0 }}>
                    {stat.n}
                  </div>
                  <div className="eyebrow">{stat.l}</div>
                </div>
              ))}
            </div>

            {/* ══ TOP 4 ══ */}
            <section style={{ padding: "48px 0" }}>
              <SectionHead
                title="Top four"
                emph="Top"
                count="The records that define you"
                moreHref={undefined}
              />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 20,
                }}
              >
                {profileFavorites.map((albumId, i) => {
                  const album = albumMap[albumId];
                  return (
                    <Link key={albumId} href={`/albums/${albumId}`}>
                      <AlbumCover src={album?.image} alt={album?.name || "Album"}>
                        <div
                          className="display"
                          style={{
                            position: "absolute",
                            top: 10,
                            left: 10,
                            fontStyle: "italic",
                            fontSize: 48,
                            lineHeight: 1,
                            color: "var(--paper)",
                            textShadow: "0 2px 10px rgba(0,0,0,0.3)",
                            zIndex: 2,
                          }}
                        >
                          {String(i + 1).padStart(2, "0")}
                        </div>
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            background:
                              "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.3) 100%)",
                            pointerEvents: "none",
                          }}
                        />
                      </AlbumCover>
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>
                          {album?.name || "Album"}
                        </div>
                        <div className="eyebrow" style={{ marginTop: 2 }}>
                          {album?.artists?.join(", ") || albumId}
                        </div>
                      </div>
                    </Link>
                  );
                })}
                {Array.from({
                  length: Math.max(0, 4 - profileFavorites.length),
                }).map((_, i) => (
                  <button
                    key={`empty-${i}`}
                    type="button"
                    onClick={() => handleEditToggle(true)}
                    style={{
                      aspectRatio: "1/1",
                      border: "1px dashed var(--line-strong)",
                      background: "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                    }}
                    className="eyebrow"
                  >
                    + Add a record
                  </button>
                ))}
              </div>
            </section>

            {/* ══ FAVORITE ARTISTS ══ */}
            {profileFavoriteArtists.length > 0 && (
              <section style={sectionStyle}>
                <SectionHead
                  title="On rotation"
                  emph="rotation"
                  count={`${profileFavoriteArtists.length} favorite artist${
                    profileFavoriteArtists.length === 1 ? "" : "s"
                  }`}
                />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(5, 1fr)",
                    gap: 16,
                  }}
                >
                  {profileFavoriteArtists.map((artistId) => {
                    const artist = artistMap[artistId];
                    return (
                      <div key={artistId}>
                        <AlbumCover
                          src={artist?.image}
                          alt={artist?.name || "Artist"}
                        />
                        <div style={{ marginTop: 10 }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>
                            {artist?.name || "Artist"}
                          </div>
                          <div className="eyebrow" style={{ marginTop: 2 }}>
                            {artist?.genres?.slice(0, 2).join(", ") || "Artist"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ══ YEAR IN LISTENING ══ */}
            <section style={sectionStyle}>
              <SectionHead
                title="Year in listening"
                emph="listening"
                count={`${new Date().getFullYear()} · ${totalThisYear} logs to date`}
              />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 240px",
                  gap: 40,
                  alignItems: "start",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(53, 1fr)",
                      gap: 3,
                      gridAutoFlow: "column",
                      gridTemplateRows: "repeat(7, 1fr)",
                    }}
                  >
                    {yearCells.map((cell, i) => (
                      <div
                        key={i}
                        style={{
                          aspectRatio: "1/1",
                          background: yearShades[cell.level],
                        }}
                        title={`${cell.date.toDateString()} — ${
                          cell.level > 0 ? "logged" : "no activity"
                        }`}
                      />
                    ))}
                  </div>
                  <div
                    className="eyebrow"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginTop: 10,
                    }}
                  >
                    {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map(
                      (month) => (
                        <span key={month}>{month}</span>
                      )
                    )}
                  </div>
                  <div
                    className="eyebrow"
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      marginTop: 14,
                    }}
                  >
                    <span>Less</span>
                    {yearShades.map((shade, i) => (
                      <span
                        key={i}
                        style={{ width: 14, height: 14, background: shade }}
                      />
                    ))}
                    <span>More</span>
                  </div>
                </div>
                <div>
                  <h3
                    className="display"
                    style={{ fontSize: 28, lineHeight: 1.1, marginBottom: 14 }}
                  >
                    Favorite <em>genres</em>
                  </h3>
                  <div style={{ display: "grid", gap: 10 }}>
                    {profileGenres.slice(0, 8).map((genre) => (
                      <div
                        key={genre}
                        className="eyebrow"
                        style={{
                          paddingBottom: 6,
                          borderBottom: "1px solid var(--line)",
                        }}
                      >
                        {genre}
                      </div>
                    ))}
                    {profileGenres.length === 0 && (
                      <div className="pull" style={{ fontSize: 18, color: "var(--muted)" }}>
                        Add favorite genres to see them here.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* ══ PINNED REVIEWS (columns) ══ */}
            {pinnedColumns.length > 0 && (
              <section style={sectionStyle}>
                <SectionHead
                  title="Pinned reviews"
                  emph="reviews"
                  count="Showcase — your picks"
                />
                {reviewActionError && (
                  <div className="note" style={{ marginBottom: 20 }}>
                    {reviewActionError}
                  </div>
                )}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 32,
                  }}
                >
                  {pinnedColumns.map((review) => {
                    const album = albumMap[review.spotify_album_id];
                    return (
                      <article
                        key={review.id}
                        style={{
                          borderTop: "1px solid var(--ink)",
                          paddingTop: 20,
                        }}
                      >
                        <Link href={`/albums/${review.spotify_album_id}`}>
                          <AlbumCover
                            src={album?.image}
                            alt={album?.name || "Album"}
                          />
                        </Link>
                        <div
                          className="display"
                          style={{ fontSize: 28, lineHeight: 1.1, marginTop: 16 }}
                        >
                          {album?.name || "Album"}
                        </div>
                        {review.body && (
                          <p className="pull" style={{ fontSize: 18, marginTop: 10 }}>
                            &ldquo;{review.body}&rdquo;
                          </p>
                        )}
                        <div
                          className="eyebrow"
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginTop: 14,
                          }}
                        >
                          <span>{album?.artists?.join(", ") || ""}</span>
                          <Stars value={rating10ToStars(review.rating)} />
                        </div>
                        <div
                          className="eyebrow"
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginTop: 8,
                          }}
                        >
                          <span>Pinned</span>
                          <button
                            type="button"
                            onClick={() => handleReviewPin(review.id, false)}
                            disabled={reviewPinning === review.id}
                            className="eyebrow"
                            style={{
                              cursor: "pointer",
                              borderBottom: "1px solid var(--ink)",
                              color: "var(--ink)",
                            }}
                          >
                            {reviewPinning === review.id ? "Saving…" : "Unpin"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ══ RECENT ENTRIES (review management) ══ */}
            <section style={sectionStyle}>
              <SectionHead
                title="Recent entries"
                emph="entries"
                count={loading ? "Loading…" : `${reviews.length} total`}
              />

              {error && (
                <div className="note" style={{ marginBottom: 20 }}>
                  {error}
                </div>
              )}

              {reviewActionError && (
                <div className="note" style={{ marginBottom: 20 }}>
                  {reviewActionError}
                </div>
              )}

              {!loading && reviews.length === 0 && (
                <p className="pull" style={{ fontSize: 20, color: "var(--muted)" }}>
                  No reviews yet.{" "}
                  <Link
                    href="/search"
                    style={{
                      fontStyle: "italic",
                      color: "var(--ink)",
                      borderBottom: "1px solid var(--ink)",
                    }}
                  >
                    Rate your first album →
                  </Link>
                </p>
              )}

              <div style={{ display: "grid", gap: 0 }}>
                {recentReviews.map((review, i) => {
                  const album = albumMap[review.spotify_album_id];
                  const date = new Date(review.created_at);
                  const isEditing = editingReviewId === review.id;
                  return (
                    <div
                      key={review.id}
                      style={{
                        padding: "16px 0",
                        borderTop:
                          i === 0 ? "1px solid var(--ink)" : "1px solid var(--line)",
                        borderBottom:
                          i === recentReviews.length - 1
                            ? "1px solid var(--ink)"
                            : undefined,
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "80px 64px 1fr auto auto",
                          gap: 20,
                          alignItems: "center",
                        }}
                      >
                        <div className="eyebrow">
                          <b
                            className="display"
                            style={{
                              display: "block",
                              fontStyle: "italic",
                              fontSize: 22,
                              color: "var(--ink)",
                              textTransform: "none",
                              letterSpacing: 0,
                            }}
                          >
                            {date.getDate()}
                          </b>
                          {date.toLocaleDateString("en-US", { month: "short" })}
                        </div>
                        <div style={{ width: 64 }}>
                          <Link href={`/albums/${review.spotify_album_id}`}>
                            <AlbumCover
                              src={album?.image}
                              alt={album?.name || "Album"}
                            />
                          </Link>
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500 }}>
                            <Link href={`/albums/${review.spotify_album_id}`}>
                              {album?.name || "Album"}
                            </Link>
                            <span className="eyebrow" style={{ marginLeft: 8 }}>
                              · {album?.artists?.join(", ") || review.spotify_album_id}
                            </span>
                          </div>
                          {review.body && !isEditing && (
                            <div className="pull" style={{ fontSize: 15, marginTop: 4 }}>
                              &ldquo;
                              {review.body.length > 120
                                ? review.body.slice(0, 120) + "…"
                                : review.body}
                              &rdquo;
                            </div>
                          )}
                        </div>
                        <div>
                          <Stars value={rating10ToStars(review.rating)} />
                        </div>
                        <div
                          className="eyebrow"
                          style={{
                            textAlign: "right",
                            display: "flex",
                            gap: 14,
                            justifyContent: "flex-end",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              handleReviewPin(review.id, !review.is_pinned)
                            }
                            disabled={reviewPinning === review.id}
                            className="eyebrow"
                            style={{
                              cursor: "pointer",
                              borderBottom: "1px solid var(--ink)",
                              color: review.is_pinned
                                ? "var(--accent)"
                                : "var(--ink)",
                            }}
                          >
                            {reviewPinning === review.id
                              ? "Saving…"
                              : review.is_pinned
                                ? "Unpin"
                                : "Pin →"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              isEditing
                                ? setEditingReviewId(null)
                                : startEditReview(review)
                            }
                            className="eyebrow"
                            style={{
                              cursor: "pointer",
                              borderBottom: "1px solid var(--ink)",
                              color: "var(--ink)",
                            }}
                          >
                            {isEditing ? "Close" : "Edit →"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReviewDelete(review.id)}
                            disabled={reviewDeleting === review.id}
                            className="eyebrow"
                            style={{
                              cursor: "pointer",
                              color: "var(--accent)",
                            }}
                          >
                            {reviewDeleting === review.id ? "Deleting…" : "Delete"}
                          </button>
                        </div>
                      </div>

                      {isEditing && (
                        <div
                          style={{
                            marginTop: 14,
                            marginLeft: 100,
                            display: "grid",
                            gap: 12,
                            maxWidth: 560,
                          }}
                        >
                          <div
                            style={{ display: "flex", alignItems: "center", gap: 14 }}
                          >
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
                            style={{ width: "100%", minHeight: 64, resize: "vertical" }}
                            placeholder="Write your review (optional)"
                            value={editBodyValue}
                            onChange={(event) => setEditBodyValue(event.target.value)}
                          />
                          {reviewActionError && (
                            <div className="note">{reviewActionError}</div>
                          )}
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
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ══ LISTS ══ */}
            <section style={sectionStyle}>
              <SectionHead
                title="Your lists"
                emph="lists"
                count={listsLoading ? "Loading…" : `${lists.length} curated`}
                moreHref="/lists/new"
                moreLabel="New list →"
              />

              {listsError && (
                <div className="note" style={{ marginBottom: 20 }}>
                  {listsError}
                </div>
              )}
              {listActionError && (
                <div className="note" style={{ marginBottom: 20 }}>
                  {listActionError}
                </div>
              )}

              {!listsLoading && lists.length === 0 && (
                <p className="pull" style={{ fontSize: 20, color: "var(--muted)" }}>
                  No lists yet.{" "}
                  <Link
                    href="/lists/new"
                    style={{
                      fontStyle: "italic",
                      color: "var(--ink)",
                      borderBottom: "1px solid var(--ink)",
                    }}
                  >
                    Start one →
                  </Link>
                </p>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: 32,
                }}
              >
                {lists.map((list) => (
                  <article
                    key={list.id}
                    style={{ borderTop: "1px solid var(--ink)", paddingTop: 20 }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        gap: 12,
                      }}
                    >
                      <Link href={`/lists/${list.id}`}>
                        <h3
                          className="display"
                          style={{ fontSize: 28, lineHeight: 1.1, margin: 0 }}
                        >
                          {list.title}
                        </h3>
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDeleteList(list.id)}
                        disabled={listDeleting === list.id}
                        className="eyebrow"
                        style={{ cursor: "pointer", color: "var(--accent)" }}
                      >
                        {listDeleting === list.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                    <div className="eyebrow" style={{ marginTop: 8 }}>
                      {list.is_ranked ? "Ranked" : "Unranked"} · {list.items.length}{" "}
                      album{list.items.length === 1 ? "" : "s"} ·{" "}
                      {list.likes_count ?? 0} like
                      {(list.likes_count ?? 0) === 1 ? "" : "s"}
                      {list.tags && list.tags.length > 0
                        ? ` · ${list.tags.map((tag) => `#${tag}`).join(" ")}`
                        : ""}
                    </div>
                    {list.description && (
                      <p className="pull" style={{ fontSize: 16, marginTop: 8 }}>
                        {list.description}
                      </p>
                    )}
                    <Link
                      href={`/lists/${list.id}`}
                      style={{ display: "block", marginTop: 14 }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(4, 1fr)",
                          gap: 8,
                        }}
                      >
                        {list.items.slice(0, 4).map((item) => {
                          const album = albumMap[item.spotify_album_id];
                          return (
                            <AlbumCover
                              key={item.spotify_album_id}
                              src={album?.image}
                              alt={album?.name || "Album"}
                            />
                          );
                        })}
                        {list.items.length === 0 && (
                          <span className="eyebrow">No albums yet.</span>
                        )}
                      </div>
                    </Link>
                  </article>
                ))}
              </div>
            </section>

            {/* ══ COMMUNITY ══ */}
            <section style={sectionStyle}>
              <SectionHead
                title="Community"
                emph="Community"
                count={`${followers.length} followers · ${following.length} following`}
              />

              {followActionError && (
                <div className="note" style={{ marginBottom: 20 }}>
                  {followActionError}
                </div>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.2fr 1fr",
                  gap: 48,
                  alignItems: "start",
                }}
              >
                <div>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>
                    Find people
                  </div>
                  <input
                    className="input"
                    placeholder="Search by name or Spotify ID"
                    value={followSearch}
                    onChange={(event) => setFollowSearch(event.target.value)}
                  />
                  {followSearching && (
                    <div className="eyebrow" style={{ marginTop: 8 }}>
                      Searching…
                    </div>
                  )}
                  {followError && (
                    <div className="note" style={{ marginTop: 8 }}>
                      {followError}
                    </div>
                  )}
                  {!followSearching &&
                    followSearch.trim().length > 1 &&
                    followResults.length === 0 &&
                    !followError && (
                      <div className="eyebrow" style={{ marginTop: 8 }}>
                        No users found yet.
                      </div>
                    )}
                  <div style={{ marginTop: 8 }}>
                    {followResults.map((person) => {
                      const isFollowing = followingIds.includes(person.id);
                      return (
                        <div key={person.id}>
                          {personRow(
                            person,
                            <button
                              type="button"
                              className="btn sm"
                              onClick={() =>
                                isFollowing
                                  ? handleUnfollowUser(person.id)
                                  : handleFollowUser(person.id)
                              }
                              disabled={followUpdatingId === person.id}
                            >
                              {followUpdatingId === person.id
                                ? "Saving…"
                                : isFollowing
                                  ? "Unfollow"
                                  : "Follow"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: "grid", gap: 28 }}>
                  <div>
                    <div className="eyebrow" style={{ marginBottom: 4 }}>
                      Following
                    </div>
                    {followingLoading && (
                      <div className="eyebrow">Loading following…</div>
                    )}
                    {!followingLoading && following.length === 0 && (
                      <div className="pull" style={{ fontSize: 16, color: "var(--muted)" }}>
                        You are not following anyone yet.
                      </div>
                    )}
                    {following.map((person) => (
                      <div key={`following-${person.id}`}>
                        {personRow(
                          person,
                          <button
                            type="button"
                            className="btn sm"
                            onClick={() => handleUnfollowUser(person.id)}
                            disabled={followUpdatingId === person.id}
                          >
                            {followUpdatingId === person.id
                              ? "Saving…"
                              : "Unfollow"}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div>
                    <div className="eyebrow" style={{ marginBottom: 4 }}>
                      Followers
                    </div>
                    {followersLoading && (
                      <div className="eyebrow">Loading followers…</div>
                    )}
                    {!followersLoading && followers.length === 0 && (
                      <div className="pull" style={{ fontSize: 16, color: "var(--muted)" }}>
                        No followers yet.
                      </div>
                    )}
                    {followers.map((person) => {
                      const isFollowing = followingIds.includes(person.id);
                      return (
                        <div key={`follower-${person.id}`}>
                          {personRow(
                            person,
                            <button
                              type="button"
                              className="btn sm"
                              onClick={() =>
                                isFollowing
                                  ? handleUnfollowUser(person.id)
                                  : handleFollowUser(person.id)
                              }
                              disabled={followUpdatingId === person.id}
                            >
                              {followUpdatingId === person.id
                                ? "Saving…"
                                : isFollowing
                                  ? "Unfollow"
                                  : "Follow"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </Shell>
  );
}
