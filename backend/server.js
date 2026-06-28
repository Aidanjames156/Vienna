require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const { pool } = require('./db');
const {
  cookieOptions,
  setSession,
  clearSession,
  getSession,
  requireAuth,
} = require('./auth');
const {
  getAuthorizeUrl,
  exchangeCodeForToken,
  getAppAccessToken,
  refreshAccessToken,
  fetchSpotifyProfile,
  fetchSpotifyJson,
  fetchTrackPreviewUrl,
} = require('./spotify');

const app = express();
const port = process.env.PORT || 4000;
const defaultOrigin = 'http://127.0.0.1:3000';
const webOriginRaw = process.env.WEB_ORIGIN || defaultOrigin;
const parsedOrigins = webOriginRaw
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const webOrigin = parsedOrigins[0] || defaultOrigin;
const allowedOrigins = new Set(parsedOrigins);
allowedOrigins.add('http://127.0.0.1:3000');
allowedOrigins.add('http://localhost:3000');

const rateLimitWindowMs = 60_000;
const rateLimitMax = 60;
const rateLimitStore = new Map();

const searchCache = new Map();
const albumCache = new Map();
const artistCache = new Map();
const artistSearchCache = new Map();
const trendingCache = new Map();
const trackPreviewCache = new Map();
const searchCacheTtlMs = 60_000;
const albumCacheTtlMs = 5 * 60_000;
const artistCacheTtlMs = 5 * 60_000;
const trendingCacheTtlMs = 5 * 60_000;
// Preview MP3 URLs are stable; cache them for a day. Failures are cached briefly
// (see getTrackPreviewUrl) so a flaky embed fetch doesn't get hammered per request.
const trackPreviewCacheTtlMs = 24 * 60 * 60_000;
const cacheMaxEntries = 500;

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const allowedExts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
      const safeExt = allowedExts.has(ext) ? ext : '';
      cb(null, `${crypto.randomBytes(16).toString('hex')}${safeExt}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
      return;
    }
    cb(new Error('invalid_file_type'));
  },
});

app.use('/uploads', express.static(uploadsDir));

function rateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || req.connection?.remoteAddress || 'unknown';
  let entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + rateLimitWindowMs };
    rateLimitStore.set(key, entry);
  }

  entry.count += 1;
  res.set('X-RateLimit-Limit', String(rateLimitMax));
  res.set('X-RateLimit-Remaining', String(Math.max(rateLimitMax - entry.count, 0)));
  res.set('X-RateLimit-Reset', String(entry.resetAt));

  if (entry.count > rateLimitMax) {
    return res.status(429).json({ error: 'rate_limited' });
  }

  return next();
}

function getCached(map, key) {
  const entry = map.get(key);
  if (!entry) {
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    map.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(map, key, value, ttlMs) {
  if (map.size > cacheMaxEntries) {
    map.clear();
  }
  map.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function isValidSpotifyId(value) {
  return /^[A-Za-z0-9]{22}$/.test(value);
}

// Resolve a track's preview MP3 via the embed-page fallback, with caching of
// both hits and misses. The cached value is wrapped as `{ url }` so that a
// null (no preview) is distinguishable from a cache miss.
async function getTrackPreviewUrl(trackId) {
  if (!isValidSpotifyId(trackId)) {
    return null;
  }
  const cached = getCached(trackPreviewCache, trackId);
  if (cached) {
    return cached.url;
  }
  try {
    const url = await fetchTrackPreviewUrl(trackId);
    setCached(trackPreviewCache, trackId, { url }, trackPreviewCacheTtlMs);
    return url;
  } catch (err) {
    // Cache the failure briefly so a flaky embed fetch isn't retried per request.
    setCached(trackPreviewCache, trackId, { url: null }, 60_000);
    return null;
  }
}

// Fill in `preview_url` for tracks the Spotify API returned as null, using a
// small worker pool so a 50-track album doesn't fire 50 requests at once.
async function enrichTracksWithPreviews(tracks) {
  const missing = (tracks || []).filter(
    (track) => track && !track.preview_url && isValidSpotifyId(track.id)
  );
  if (missing.length === 0) {
    return;
  }
  const concurrency = 6;
  let index = 0;
  async function worker() {
    while (index < missing.length) {
      const track = missing[index++];
      const url = await getTrackPreviewUrl(track.id);
      if (url) {
        track.preview_url = url;
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, missing.length) }, () => worker())
  );
}

const maxListTags = 8;
const maxListTagLength = 24;

function extractListTags(input) {
  let raw = [];
  if (Array.isArray(input)) {
    raw = input;
  } else if (typeof input === 'string') {
    raw = input.split(',');
  }

  const cleaned = raw
    .filter((tag) => typeof tag === 'string')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .map((tag) => tag.replace(/^#+/, ''))
    .map((tag) => tag.replace(/\s+/g, ' '))
    .map((tag) => tag.toLowerCase());

  return Array.from(new Set(cleaned));
}

function normalizeChartRegion(value) {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!raw) {
    return 'global';
  }
  if (raw === 'global') {
    return 'global';
  }
  if (/^[a-z]{2}$/.test(raw)) {
    return raw;
  }
  return 'global';
}

function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  fields.push(current);
  return fields;
}

function extractTrackIdsFromChartCsv(csvText, maxTracks = 50) {
  if (typeof csvText !== 'string' || !csvText.trim()) {
    return [];
  }
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return [];
  }

  const header = parseCsvLine(lines[0]).map((field) => field.trim().toLowerCase());
  let urlIndex = header.indexOf('url');
  if (urlIndex < 0) {
    urlIndex = header.findIndex((field) => field.includes('url'));
  }
  if (urlIndex < 0) {
    return [];
  }

  const ids = [];
  const seen = new Set();
  for (let i = 1; i < lines.length; i += 1) {
    const fields = parseCsvLine(lines[i]);
    const url = fields[urlIndex] || '';
    const match = String(url).match(/open\.spotify\.com\/track\/([A-Za-z0-9]{22})/);
    if (!match) {
      continue;
    }
    const id = match[1];
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
    if (ids.length >= maxTracks) {
      break;
    }
  }
  return ids;
}

async function getUserRefreshToken(userId) {
  const result = await pool.query(
    'SELECT refresh_token FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0]?.refresh_token || null;
}

async function getAccessTokenForUser(userId) {
  const refreshToken = await getUserRefreshToken(userId);
  if (!refreshToken) {
    const error = new Error('missing_refresh_token');
    error.code = 'missing_refresh_token';
    throw error;
  }

  const { accessToken, refreshToken: newRefreshToken } =
    await refreshAccessToken(refreshToken);

  if (newRefreshToken) {
    await pool.query(
      'UPDATE users SET refresh_token = $1 WHERE id = $2',
      [newRefreshToken, userId]
    );
  }

  return accessToken;
}

async function getAccessContext(req) {
  const session = getSession(req);
  if (session?.sub) {
    try {
      const accessToken = await getAccessTokenForUser(session.sub);
      return { accessToken, cacheKey: `user:${session.sub}` };
    } catch (err) {
      console.warn('Falling back to app token for Spotify access.', err?.message);
    }
  }

  const accessToken = await getAppAccessToken();
  return { accessToken, cacheKey: 'app' };
}

app.get('/', (req, res) => {
  res.json({ name: 'jukebox-api', status: 'ok' });
});

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ status: 'error', error: 'database_unavailable' });
  }
});

app.get('/auth/spotify', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('spotify_oauth_state', state, {
    ...cookieOptions,
    maxAge: 10 * 60 * 1000,
  });
  res.redirect(getAuthorizeUrl(state));
});

app.get('/auth/spotify/callback', async (req, res) => {
  const code = Array.isArray(req.query.code) ? req.query.code[0] : req.query.code;
  const state = Array.isArray(req.query.state) ? req.query.state[0] : req.query.state;
  const storedState = req.cookies?.spotify_oauth_state;

  if (!code || !state || !storedState || state !== storedState) {
    return res.status(400).json({ error: 'invalid_state' });
  }

  res.clearCookie('spotify_oauth_state', cookieOptions);

  try {
    const { accessToken, refreshToken: incomingRefreshToken } = await exchangeCodeForToken(code);
    const profile = await fetchSpotifyProfile(accessToken);

    let refreshToken = incomingRefreshToken;
    if (!refreshToken) {
      const existing = await pool.query(
        'SELECT refresh_token FROM users WHERE spotify_id = $1',
        [profile.id]
      );
      refreshToken = existing.rows[0]?.refresh_token || null;
    }

    if (!refreshToken) {
      return res.status(500).json({ error: 'missing_refresh_token' });
    }

    const result = await pool.query(
      `INSERT INTO users (spotify_id, display_name, refresh_token)
       VALUES ($1, $2, $3)
       ON CONFLICT (spotify_id)
       DO UPDATE SET display_name = COALESCE(users.display_name, EXCLUDED.display_name),
                     refresh_token = EXCLUDED.refresh_token
       RETURNING id, spotify_id, display_name`,
      [profile.id, profile.display_name || null, refreshToken]
    );

    setSession(res, result.rows[0]);
    return res.redirect(webOrigin);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'spotify_auth_failed' });
  }
});

app.get('/auth/me', async (req, res) => {
  const session = getSession(req);
  if (!session) {
    return res.status(401).json({ user: null });
  }

  try {
    const result = await pool.query(
      'SELECT id, spotify_id, display_name FROM users WHERE id = $1',
      [session.sub]
    );

    return res.json({ user: result.rows[0] || null });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'user_lookup_failed' });
  }
});

app.post('/auth/logout', (req, res) => {
  clearSession(res);
  res.json({ status: 'ok' });
});

app.get('/users/search', async (req, res) => {
  const queryRaw = Array.isArray(req.query.query) ? req.query.query[0] : req.query.query;
  const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const limit = Math.min(Math.max(parseInt(limitRaw || '10', 10), 1), 20);

  if (!queryRaw || !queryRaw.trim()) {
    return res.status(400).json({ error: 'query_required' });
  }

  const query = `%${queryRaw.trim()}%`;
  const session = getSession(req);
  const values = [query];
  let where = '(display_name ILIKE $1 OR spotify_id ILIKE $1)';

  if (session?.sub) {
    values.push(session.sub);
    where += ` AND id <> $${values.length}`;
  }

  values.push(limit);

  try {
    const result = await pool.query(
      `SELECT id, spotify_id, display_name, avatar_url
       FROM users
       WHERE ${where}
       ORDER BY display_name NULLS LAST, spotify_id
       LIMIT $${values.length}`,
      values
    );

    return res.json({ users: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'user_search_failed' });
  }
});

app.post('/users/:id/follow', requireAuth, async (req, res) => {
  const targetId = parseInt(req.params.id, 10);

  if (!targetId) {
    return res.status(400).json({ error: 'user_id_required' });
  }

  if (targetId === req.user.sub) {
    return res.status(400).json({ error: 'cannot_follow_self' });
  }

  try {
    const targetResult = await pool.query(
      'SELECT id FROM users WHERE id = $1',
      [targetId]
    );

    if (targetResult.rows.length === 0) {
      return res.status(404).json({ error: 'user_not_found' });
    }

    await pool.query(
      `INSERT INTO follows (follower_id, following_id)
       VALUES ($1, $2)
       ON CONFLICT (follower_id, following_id) DO NOTHING`,
      [req.user.sub, targetId]
    );

    return res.json({ status: 'ok', following_id: targetId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'follow_failed' });
  }
});

app.delete('/users/:id/follow', requireAuth, async (req, res) => {
  const targetId = parseInt(req.params.id, 10);

  if (!targetId) {
    return res.status(400).json({ error: 'user_id_required' });
  }

  if (targetId === req.user.sub) {
    return res.status(400).json({ error: 'cannot_follow_self' });
  }

  try {
    await pool.query(
      'DELETE FROM follows WHERE follower_id = $1 AND following_id = $2',
      [req.user.sub, targetId]
    );

    return res.json({ status: 'ok', following_id: targetId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'unfollow_failed' });
  }
});

app.get('/users/:id/followers', async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const limit = Math.min(Math.max(parseInt(limitRaw || '20', 10), 1), 100);

  if (!userId) {
    return res.status(400).json({ error: 'user_id_required' });
  }

  try {
    const result = await pool.query(
      `SELECT u.id, u.spotify_id, u.display_name, u.avatar_url, f.created_at
       FROM follows f
       JOIN users u ON u.id = f.follower_id
       WHERE f.following_id = $1
       ORDER BY f.created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return res.json({ followers: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'followers_fetch_failed' });
  }
});

app.get('/users/:id/following', async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const limit = Math.min(Math.max(parseInt(limitRaw || '20', 10), 1), 100);

  if (!userId) {
    return res.status(400).json({ error: 'user_id_required' });
  }

  try {
    const result = await pool.query(
      `SELECT u.id, u.spotify_id, u.display_name, u.avatar_url, f.created_at
       FROM follows f
       JOIN users u ON u.id = f.following_id
       WHERE f.follower_id = $1
       ORDER BY f.created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return res.json({ following: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'following_fetch_failed' });
  }
});

app.get('/me/profile', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, spotify_id, display_name, avatar_url, bio,
              favorite_genres, favorite_album_ids, favorite_artist_ids
       FROM users
       WHERE id = $1`,
      [req.user.sub]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'profile_not_found' });
    }

    return res.json({ profile: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'profile_fetch_failed' });
  }
});

app.patch('/me/profile', requireAuth, async (req, res) => {
  const updates = [];
  const values = [];

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'display_name')) {
    const displayNameRaw =
      typeof req.body.display_name === 'string' ? req.body.display_name.trim() : '';
    const displayName = displayNameRaw.length > 0 ? displayNameRaw : null;
    if (displayName && displayName.length > 80) {
      return res.status(400).json({ error: 'display_name_too_long' });
    }
    updates.push(`display_name = $${values.length + 1}`);
    values.push(displayName);
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'bio')) {
    const bioRaw = typeof req.body.bio === 'string' ? req.body.bio.trim() : '';
    const bio = bioRaw.length > 0 ? bioRaw : null;
    if (bio && bio.length > 500) {
      return res.status(400).json({ error: 'bio_too_long' });
    }
    updates.push(`bio = $${values.length + 1}`);
    values.push(bio);
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'favorite_genres')) {
    const genresRaw = Array.isArray(req.body.favorite_genres)
      ? req.body.favorite_genres
      : [];
    const genres = genresRaw
      .filter((genre) => typeof genre === 'string')
      .map((genre) => genre.trim())
      .filter((genre) => genre.length > 0);
    const uniqueGenres = Array.from(new Set(genres));
    if (uniqueGenres.length > 10) {
      return res.status(400).json({ error: 'favorite_genres_too_many' });
    }
    if (uniqueGenres.some((genre) => genre.length > 30)) {
      return res.status(400).json({ error: 'favorite_genre_too_long' });
    }
    updates.push(`favorite_genres = $${values.length + 1}`);
    values.push(uniqueGenres);
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'favorite_album_ids')) {
    if (!Array.isArray(req.body.favorite_album_ids)) {
      return res.status(400).json({ error: 'favorite_album_ids_invalid' });
    }
    const albumIds = req.body.favorite_album_ids
      .filter((value) => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    if (albumIds.length > 3) {
      return res.status(400).json({ error: 'favorite_album_ids_too_many' });
    }

    if (albumIds.some((id) => !isValidSpotifyId(id))) {
      return res.status(400).json({ error: 'favorite_album_ids_invalid' });
    }

    updates.push(`favorite_album_ids = $${values.length + 1}`);
    values.push(albumIds);
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'favorite_artist_ids')) {
    if (!Array.isArray(req.body.favorite_artist_ids)) {
      return res.status(400).json({ error: 'favorite_artist_ids_invalid' });
    }
    const artistIds = req.body.favorite_artist_ids
      .filter((value) => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    if (artistIds.length > 5) {
      return res.status(400).json({ error: 'favorite_artist_ids_too_many' });
    }

    if (artistIds.some((id) => !isValidSpotifyId(id))) {
      return res.status(400).json({ error: 'favorite_artist_ids_invalid' });
    }

    updates.push(`favorite_artist_ids = $${values.length + 1}`);
    values.push(artistIds);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'profile_update_required' });
  }

  try {
    values.push(req.user.sub);
    const result = await pool.query(
      `UPDATE users
       SET ${updates.join(', ')}
       WHERE id = $${values.length}
       RETURNING id, spotify_id, display_name, avatar_url, bio,
                 favorite_genres, favorite_album_ids, favorite_artist_ids`,
      values
    );

    return res.json({ profile: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'profile_update_failed' });
  }
});

app.post('/me/avatar', requireAuth, (req, res) => {
  upload.single('avatar')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'avatar_too_large' });
      }
      return res.status(400).json({ error: 'avatar_invalid' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'avatar_required' });
    }

    const avatarUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    try {
      await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [
        avatarUrl,
        req.user.sub,
      ]);
      return res.json({ avatar_url: avatarUrl });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'avatar_update_failed' });
    }
  });
});

app.get('/spotify/search', rateLimit, async (req, res) => {
  const query = Array.isArray(req.query.query) ? req.query.query[0] : req.query.query;
  const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const limit = Math.min(Math.max(parseInt(limitRaw || '10', 10), 1), 20);

  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'query_required' });
  }

  try {
    const { accessToken, cacheKey } = await getAccessContext(req);
    const cacheId = `${cacheKey}:search:${limit}:${query.trim().toLowerCase()}`;
    const cached = getCached(searchCache, cacheId);
    if (cached) {
      res.set('X-Cache', 'HIT');
      return res.json(cached);
    }

    const url = new URL('https://api.spotify.com/v1/search');
    url.searchParams.set('q', query.trim());
    url.searchParams.set('type', 'album');
    url.searchParams.set('limit', String(limit));

    const data = await fetchSpotifyJson(accessToken, url.toString());
    const mappedAlbums = (data.albums?.items || []).map((album) => ({
      id: album.id,
      name: album.name,
      artists: album.artists?.map((artist) => artist.name) || [],
      image: album.images?.[1]?.url || album.images?.[0]?.url || null,
      release_date: album.release_date,
      total_tracks: album.total_tracks,
    }));
    const albums = [];
    const seen = new Map();
    mappedAlbums.forEach((album) => {
      if (!album) {
        return;
      }
      const nameKey = (album.name || '').trim().toLowerCase();
      const artistKey = (album.artists?.[0] || '').trim().toLowerCase();
      const key = `${nameKey}|${artistKey}`;
      const existingIndex = seen.get(key);
      if (typeof existingIndex !== 'number') {
        seen.set(key, albums.length);
        albums.push(album);
        return;
      }
      if (!albums[existingIndex].image && album.image) {
        albums[existingIndex] = album;
      }
    });

    const payload = { albums };
    setCached(searchCache, cacheId, payload, searchCacheTtlMs);
    res.set('X-Cache', 'MISS');
    return res.json(payload);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'spotify_search_failed' });
  }
});

app.get('/spotify/trending', rateLimit, async (req, res) => {
  const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const limit = Math.min(Math.max(parseInt(limitRaw || '12', 10), 1), 20);

  try {
    const { accessToken, cacheKey } = await getAccessContext(req);

    const cacheId = `${cacheKey}:trending:new-releases:${limit}`;
    const cached = getCached(trendingCache, cacheId);
    if (cached) {
      res.set('X-Cache', 'HIT');
      return res.json(cached);
    }

    // Candidate pool: Spotify New Releases. This replaces the editorial Top-50
    // playlist, which Spotify removed from the Web API in Nov 2024 (404s now).
    const releasesUrl = new URL('https://api.spotify.com/v1/browse/new-releases');
    releasesUrl.searchParams.set('limit', '50');

    let releasesData;
    try {
      releasesData = await fetchSpotifyJson(accessToken, releasesUrl.toString());
    } catch (err) {
      console.error(err);
      return res.status(503).json({ error: 'spotify_trending_unavailable' });
    }

    const candidates = Array.isArray(releasesData.albums?.items)
      ? releasesData.albums.items
      : [];
    const candidateIds = [];
    const seen = new Set();
    for (const album of candidates) {
      if (!album?.id || !isValidSpotifyId(album.id) || seen.has(album.id)) {
        continue;
      }
      seen.add(album.id);
      candidateIds.push(album.id);
    }

    const mapAlbum = (album) => ({
      id: album.id,
      name: album.name,
      artists: album.artists?.map((artist) => artist.name) || [],
      image: album.images?.[1]?.url || album.images?.[0]?.url || null,
      release_date: album.release_date,
      total_tracks: album.total_tracks,
    });

    // New-releases items are simplified objects without `popularity`, so fetch the
    // full album objects (<=20 ids per call) and rank by Spotify's popularity score.
    const idChunks = [];
    for (let i = 0; i < candidateIds.length; i += 20) {
      idChunks.push(candidateIds.slice(i, i + 20));
    }

    let albums;
    try {
      const chunkResults = await Promise.all(
        idChunks.map((chunk) => {
          const albumsUrl = new URL('https://api.spotify.com/v1/albums');
          albumsUrl.searchParams.set('ids', chunk.join(','));
          return fetchSpotifyJson(accessToken, albumsUrl.toString());
        })
      );
      albums = chunkResults
        .flatMap((result) => (Array.isArray(result.albums) ? result.albums : []))
        .filter(Boolean)
        .map((album) => ({
          ...mapAlbum(album),
          popularity: typeof album.popularity === 'number' ? album.popularity : 0,
        }))
        .sort((a, b) => b.popularity - a.popularity)
        .slice(0, limit);
    } catch (err) {
      // Enrichment failed — fall back to release order without the popularity sort.
      console.warn('Trending popularity enrichment failed; using release order.', err?.message);
      albums = candidates
        .filter((album) => album?.id && isValidSpotifyId(album.id))
        .map(mapAlbum)
        .slice(0, limit);
    }

    const payload = { albums, source: 'new-releases' };
    setCached(trendingCache, cacheId, payload, trendingCacheTtlMs);
    res.set('X-Cache', 'MISS');
    return res.json(payload);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'spotify_trending_failed' });
  }
});

app.get('/spotify/artists/search', rateLimit, async (req, res) => {
  const query = Array.isArray(req.query.query) ? req.query.query[0] : req.query.query;
  const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const limit = Math.min(Math.max(parseInt(limitRaw || '10', 10), 1), 20);

  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'query_required' });
  }

  try {
    const { accessToken, cacheKey } = await getAccessContext(req);
    const cacheId = `${cacheKey}:artist-search:${limit}:${query.trim().toLowerCase()}`;
    const cached = getCached(artistSearchCache, cacheId);
    if (cached) {
      res.set('X-Cache', 'HIT');
      return res.json(cached);
    }

    const url = new URL('https://api.spotify.com/v1/search');
    url.searchParams.set('q', query.trim());
    url.searchParams.set('type', 'artist');
    url.searchParams.set('limit', String(limit));

    const data = await fetchSpotifyJson(accessToken, url.toString());
    const artists = (data.artists?.items || []).map((artist) => ({
      id: artist.id,
      name: artist.name,
      image: artist.images?.[1]?.url || artist.images?.[0]?.url || null,
      genres: artist.genres || [],
    }));

    const payload = { artists };
    setCached(artistSearchCache, cacheId, payload, searchCacheTtlMs);
    res.set('X-Cache', 'MISS');
    return res.json(payload);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'spotify_artist_search_failed' });
  }
});

app.get('/spotify/albums', rateLimit, async (req, res) => {
  const idsRaw = Array.isArray(req.query.ids)
    ? req.query.ids.join(',')
    : req.query.ids;

  if (!idsRaw || typeof idsRaw !== 'string') {
    return res.status(400).json({ error: 'ids_required' });
  }

  const ids = idsRaw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => isValidSpotifyId(id));

  if (ids.length === 0) {
    return res.status(400).json({ error: 'ids_invalid' });
  }

  if (ids.length > 20) {
    return res.status(400).json({ error: 'too_many_ids' });
  }

  try {
    const { accessToken, cacheKey } = await getAccessContext(req);
    const cacheIds = ids.map((id) => ({
      id,
      cached: getCached(albumCache, `${cacheKey}:album:${id}`),
    }));

    const cachedAlbums = cacheIds
      .filter((entry) => entry.cached)
      .map((entry) => entry.cached.album);

    const missingIds = cacheIds
      .filter((entry) => !entry.cached)
      .map((entry) => entry.id);

    let fetchedAlbums = [];
    if (missingIds.length > 0) {
      const url = new URL('https://api.spotify.com/v1/albums');
      url.searchParams.set('ids', missingIds.join(','));
      const data = await fetchSpotifyJson(accessToken, url.toString());
      fetchedAlbums = (data.albums || [])
        .filter(Boolean)
        .map((album) => ({
          id: album.id,
          name: album.name,
          artists: album.artists?.map((artist) => artist.name) || [],
          images: album.images || [],
          release_date: album.release_date,
          total_tracks: album.total_tracks,
          label: album.label,
          genres: album.genres || [],
        }));
    }

    const allAlbums = [...cachedAlbums, ...fetchedAlbums];
    fetchedAlbums.forEach((album) => {
      const payload = { album };
      setCached(albumCache, `${cacheKey}:album:${album.id}`, payload, albumCacheTtlMs);
    });

    return res.json({ albums: allAlbums });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'spotify_album_failed' });
  }
});

app.get('/spotify/artists', rateLimit, async (req, res) => {
  const idsRaw = Array.isArray(req.query.ids)
    ? req.query.ids.join(',')
    : req.query.ids;

  if (!idsRaw || typeof idsRaw !== 'string') {
    return res.status(400).json({ error: 'ids_required' });
  }

  const ids = idsRaw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => isValidSpotifyId(id));

  if (ids.length === 0) {
    return res.status(400).json({ error: 'ids_invalid' });
  }

  if (ids.length > 20) {
    return res.status(400).json({ error: 'too_many_ids' });
  }

  try {
    const { accessToken, cacheKey } = await getAccessContext(req);
    const cacheIds = ids.map((id) => ({
      id,
      cached: getCached(artistCache, `${cacheKey}:artist:${id}`),
    }));

    const cachedArtists = cacheIds
      .filter((entry) => entry.cached)
      .map((entry) => entry.cached.artist);

    const missingIds = cacheIds
      .filter((entry) => !entry.cached)
      .map((entry) => entry.id);

    let fetchedArtists = [];
    if (missingIds.length > 0) {
      const url = new URL('https://api.spotify.com/v1/artists');
      url.searchParams.set('ids', missingIds.join(','));
      const data = await fetchSpotifyJson(accessToken, url.toString());
      fetchedArtists = (data.artists || [])
        .filter(Boolean)
        .map((artist) => ({
          id: artist.id,
          name: artist.name,
          images: artist.images || [],
          genres: artist.genres || [],
        }));

      fetchedArtists.forEach((artist) => {
        setCached(
          artistCache,
          `${cacheKey}:artist:${artist.id}`,
          { artist },
          artistCacheTtlMs
        );
      });
    }

    const artists = [...cachedArtists, ...fetchedArtists];
    return res.json({ artists });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'spotify_artists_failed' });
  }
});

app.get('/spotify/albums/:id', rateLimit, async (req, res) => {
  const albumId = req.params.id;

  try {
    const { accessToken, cacheKey } = await getAccessContext(req);
    const cacheId = `${cacheKey}:album:${albumId}`;
    const cached = getCached(albumCache, cacheId);
    if (cached) {
      const cachedAlbum = cached.album;
      const hasTracks =
        Array.isArray(cachedAlbum?.tracks) && cachedAlbum.tracks.length > 0;
      if (!hasTracks) {
        // Ignore summary caches without track data.
      } else {
        res.set('X-Cache', 'HIT');
        return res.json(cached);
      }
    }

    const data = await fetchSpotifyJson(
      accessToken,
      `https://api.spotify.com/v1/albums/${albumId}`
    );

    let genres = Array.isArray(data.genres) ? data.genres : [];
    if (genres.length === 0 && Array.isArray(data.artists) && data.artists.length > 0) {
      const artistIds = data.artists
        .map((artist) => artist?.id)
        .filter(Boolean)
        .slice(0, 5);
      if (artistIds.length > 0) {
        try {
          const artistData = await fetchSpotifyJson(
            accessToken,
            `https://api.spotify.com/v1/artists?ids=${artistIds.join(',')}`
          );
          const artistGenres = (artistData.artists || [])
            .flatMap((artist) => artist.genres || [])
            .filter((genre) => typeof genre === 'string');
          if (artistGenres.length > 0) {
            genres = Array.from(new Set(artistGenres)).slice(0, 6);
          }
        } catch (err) {
          // ignore artist genre failures and fall back to album genres
        }
      }
    }

    const album = {
      id: data.id,
      name: data.name,
      artists: data.artists?.map((artist) => artist.name) || [],
      images: data.images || [],
      release_date: data.release_date,
      total_tracks: data.total_tracks,
      label: data.label,
      genres,
      tracks: data.tracks?.items?.map((track) => ({
        id: track.id,
        name: track.name,
        track_number: track.track_number,
        duration_ms: track.duration_ms,
        preview_url: track.preview_url,
      })) || [],
    };

    // Spotify's API returns preview_url: null since the late-2024 deprecation;
    // recover previews from the embed page before caching the album.
    await enrichTracksWithPreviews(album.tracks);

    const payload = { album };
    setCached(albumCache, cacheId, payload, albumCacheTtlMs);
    res.set('X-Cache', 'MISS');
    return res.json(payload);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'spotify_album_failed' });
  }
});

app.get('/albums/:id/reviews', async (req, res) => {
  const albumId = req.params.id;
  const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const limit = Math.min(Math.max(parseInt(limitRaw || '50', 10), 1), 100);

  if (!albumId) {
    return res.status(400).json({ error: 'album_id_required' });
  }

  try {
    const result = await pool.query(
      `SELECT r.id, r.rating, r.body, r.created_at, r.is_pinned, r.pinned_at,
              u.id AS user_id, u.display_name, u.spotify_id
       FROM reviews r
       JOIN users u ON r.user_id = u.id
       WHERE r.spotify_album_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2`,
      [albumId, limit]
    );

    const reviews = result.rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      body: row.body,
      created_at: row.created_at,
      is_pinned: row.is_pinned,
      pinned_at: row.pinned_at,
      user: {
        id: row.user_id,
        display_name: row.display_name,
        spotify_id: row.spotify_id,
      },
    }));

    return res.json({ reviews });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'reviews_fetch_failed' });
  }
});

app.post('/albums/:id/reviews', requireAuth, async (req, res) => {
  const albumId = req.params.id;
  const rating = parseInt(req.body?.rating, 10);
  const bodyRaw = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  const body = bodyRaw.length > 0 ? bodyRaw : null;

  if (!albumId) {
    return res.status(400).json({ error: 'album_id_required' });
  }

  if (Number.isNaN(rating) || rating < 1 || rating > 10) {
    return res.status(400).json({ error: 'rating_invalid' });
  }

  if (body && body.length > 2000) {
    return res.status(400).json({ error: 'body_too_long' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO reviews (user_id, spotify_album_id, rating, body)
       VALUES ($1, $2, $3, $4)
       RETURNING id, rating, body, created_at, is_pinned, pinned_at`,
      [req.user.sub, albumId, rating, body]
    );

    const userResult = await pool.query(
      'SELECT id, display_name, spotify_id FROM users WHERE id = $1',
      [req.user.sub]
    );
    const userRow = userResult.rows[0] || {};

    return res.status(201).json({
      review: {
        id: result.rows[0].id,
        rating: result.rows[0].rating,
        body: result.rows[0].body,
        created_at: result.rows[0].created_at,
        is_pinned: result.rows[0].is_pinned,
        pinned_at: result.rows[0].pinned_at,
        user: {
          id: userRow.id || req.user.sub,
          display_name: userRow.display_name || null,
          spotify_id: userRow.spotify_id || null,
        },
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'review_create_failed' });
  }
});

app.patch('/reviews/:id', requireAuth, async (req, res) => {
  const reviewId = parseInt(req.params.id, 10);
  const hasRating = Object.prototype.hasOwnProperty.call(req.body || {}, 'rating');
  const hasBody = Object.prototype.hasOwnProperty.call(req.body || {}, 'body');
  const hasPinned = Object.prototype.hasOwnProperty.call(req.body || {}, 'is_pinned');

  if (!reviewId) {
    return res.status(400).json({ error: 'review_id_required' });
  }

  if (!hasRating && !hasBody && !hasPinned) {
    return res.status(400).json({ error: 'review_update_required' });
  }

  const updates = [];
  const values = [];
  let nextPinned = null;

  if (hasRating) {
    const rating = parseInt(req.body?.rating, 10);
    if (Number.isNaN(rating) || rating < 1 || rating > 10) {
      return res.status(400).json({ error: 'rating_invalid' });
    }
    updates.push(`rating = $${values.length + 1}`);
    values.push(rating);
  }

  if (hasBody) {
    const bodyRaw = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    const body = bodyRaw.length > 0 ? bodyRaw : null;
    if (body && body.length > 2000) {
      return res.status(400).json({ error: 'body_too_long' });
    }
    updates.push(`body = $${values.length + 1}`);
    values.push(body);
  }

  if (hasPinned) {
    if (typeof req.body?.is_pinned !== 'boolean') {
      return res.status(400).json({ error: 'is_pinned_invalid' });
    }
    nextPinned = req.body.is_pinned;
  }

  try {
    const reviewResult = await pool.query(
      `SELECT id, rating, body, created_at, spotify_album_id, is_pinned, pinned_at
       FROM reviews
       WHERE id = $1 AND user_id = $2`,
      [reviewId, req.user.sub]
    );

    if (reviewResult.rows.length === 0) {
      return res.status(404).json({ error: 'review_not_found' });
    }

    const currentPinned = reviewResult.rows[0].is_pinned === true;
    if (nextPinned === true && !currentPinned) {
      const pinnedCountResult = await pool.query(
        'SELECT COUNT(*) FROM reviews WHERE user_id = $1 AND is_pinned = true',
        [req.user.sub]
      );
      const pinnedCount = parseInt(pinnedCountResult.rows[0]?.count || '0', 10);
      if (pinnedCount >= 1) {
        return res.status(400).json({ error: 'pinned_limit' });
      }
      updates.push(`is_pinned = $${values.length + 1}`);
      values.push(true);
      updates.push(`pinned_at = $${values.length + 1}`);
      values.push(new Date().toISOString());
    } else if (nextPinned === false && currentPinned) {
      updates.push(`is_pinned = $${values.length + 1}`);
      values.push(false);
      updates.push(`pinned_at = $${values.length + 1}`);
      values.push(null);
    }

    if (updates.length === 0) {
      return res.json({ review: reviewResult.rows[0] });
    }

    values.push(reviewId, req.user.sub);
    const result = await pool.query(
      `UPDATE reviews
       SET ${updates.join(', ')}
       WHERE id = $${values.length - 1} AND user_id = $${values.length}
       RETURNING id, rating, body, created_at, spotify_album_id, is_pinned, pinned_at`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'review_not_found' });
    }

    return res.json({ review: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'review_update_failed' });
  }
});

app.delete('/reviews/:id', requireAuth, async (req, res) => {
  const reviewId = parseInt(req.params.id, 10);

  if (!reviewId) {
    return res.status(400).json({ error: 'review_id_required' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM reviews WHERE id = $1 AND user_id = $2 RETURNING id',
      [reviewId, req.user.sub]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'review_not_found' });
    }

    return res.json({ status: 'ok' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'review_delete_failed' });
  }
});

app.get('/me/reviews', requireAuth, async (req, res) => {
  const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const limit = Math.min(Math.max(parseInt(limitRaw || '50', 10), 1), 100);

  try {
    const result = await pool.query(
      `SELECT id, spotify_album_id, rating, body, created_at, is_pinned, pinned_at
       FROM reviews
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [req.user.sub, limit]
    );

    const reviews = result.rows.map((row) => ({
      id: row.id,
      spotify_album_id: row.spotify_album_id,
      rating: row.rating,
      body: row.body,
      created_at: row.created_at,
      is_pinned: row.is_pinned,
      pinned_at: row.pinned_at,
    }));

    return res.json({ reviews });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'reviews_fetch_failed' });
  }
});

app.get('/me/lists', requireAuth, async (req, res) => {
  try {
    const listResult = await pool.query(
      `SELECT l.id, l.title, l.description, l.is_ranked, l.created_at,
              COALESCE(COUNT(ll.user_id), 0) AS likes_count,
              EXISTS (
                SELECT 1 FROM list_likes ll2
                WHERE ll2.list_id = l.id AND ll2.user_id = $1
              ) AS liked_by_me
       FROM lists l
       LEFT JOIN list_likes ll ON ll.list_id = l.id
       WHERE l.user_id = $1
       GROUP BY l.id, l.title, l.description, l.is_ranked, l.created_at
       ORDER BY l.created_at DESC`,
      [req.user.sub]
    );

    const lists = listResult.rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      is_ranked: row.is_ranked,
      created_at: row.created_at,
      likes_count: parseInt(row.likes_count, 10) || 0,
      liked_by_me: row.liked_by_me === true,
      tags: [],
      items: [],
    }));

    if (lists.length === 0) {
      return res.json({ lists: [] });
    }

    const listIds = lists.map((list) => list.id);
    const itemResult = await pool.query(
      `SELECT list_id, spotify_album_id, created_at, position
       FROM list_items
       WHERE list_id = ANY($1)
       ORDER BY position DESC, created_at DESC`,
      [listIds]
    );

    const listMap = new Map(lists.map((list) => [list.id, list]));
    itemResult.rows.forEach((row) => {
      const list = listMap.get(row.list_id);
      if (list) {
        list.items.push({
          spotify_album_id: row.spotify_album_id,
          created_at: row.created_at,
          position: row.position,
        });
      }
    });

    const tagResult = await pool.query(
      `SELECT list_id, tag
       FROM list_tags
       WHERE list_id = ANY($1)
       ORDER BY tag`,
      [listIds]
    );

    tagResult.rows.forEach((row) => {
      const list = listMap.get(row.list_id);
      if (list) {
        list.tags.push(row.tag);
      }
    });

    return res.json({ lists });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'lists_fetch_failed' });
  }
});

app.post('/me/lists', requireAuth, async (req, res) => {
  const titleRaw = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const descriptionRaw =
    typeof req.body?.description === 'string' ? req.body.description.trim() : '';
  const description = descriptionRaw.length > 0 ? descriptionRaw : null;
  const isRanked = req.body?.is_ranked === true;
  const tags = extractListTags(req.body?.tags);

  if (!titleRaw) {
    return res.status(400).json({ error: 'title_required' });
  }

  if (titleRaw.length > 120) {
    return res.status(400).json({ error: 'title_too_long' });
  }

  if (description && description.length > 500) {
    return res.status(400).json({ error: 'description_too_long' });
  }

  if (tags.length > maxListTags) {
    return res.status(400).json({ error: 'tags_too_many' });
  }

  if (tags.some((tag) => tag.length > maxListTagLength)) {
    return res.status(400).json({ error: 'tag_too_long' });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO lists (user_id, title, description, is_ranked)
         VALUES ($1, $2, $3, $4)
         RETURNING id, title, description, is_ranked, created_at`,
        [req.user.sub, titleRaw, description, isRanked]
      );

      const listId = result.rows[0]?.id;
      if (listId && tags.length > 0) {
        const values = [listId, ...tags];
        const placeholders = tags
          .map((_, index) => `($1, $${index + 2})`)
          .join(', ');
        await client.query(
          `INSERT INTO list_tags (list_id, tag)
           VALUES ${placeholders}
           ON CONFLICT (list_id, tag) DO NOTHING`,
          values
        );
      }

      await client.query('COMMIT');
      return res.status(201).json({
        list: {
          ...result.rows[0],
          tags,
        },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'list_create_failed' });
  }
});

app.patch('/lists/:id', requireAuth, async (req, res) => {
  const listId = parseInt(req.params.id, 10);
  const isRanked =
    typeof req.body?.is_ranked === 'boolean' ? req.body.is_ranked : null;
  const hasTitle = Object.prototype.hasOwnProperty.call(req.body || {}, 'title');
  const hasDescription = Object.prototype.hasOwnProperty.call(req.body || {}, 'description');
  const hasTags = Object.prototype.hasOwnProperty.call(req.body || {}, 'tags');

  if (!listId) {
    return res.status(400).json({ error: 'list_id_required' });
  }

  if (isRanked === null && !hasTitle && !hasDescription && !hasTags) {
    return res.status(400).json({ error: 'update_required' });
  }

  try {
    const listResult = await pool.query(
      'SELECT id FROM lists WHERE id = $1 AND user_id = $2',
      [listId, req.user.sub]
    );

    if (listResult.rows.length === 0) {
      return res.status(404).json({ error: 'list_not_found' });
    }

    const updates = [];
    const values = [];
    const tags = hasTags ? extractListTags(req.body?.tags) : [];

    if (isRanked !== null) {
      updates.push(`is_ranked = $${values.length + 1}`);
      values.push(isRanked);
    }

    if (hasTitle) {
      const titleRaw =
        typeof req.body?.title === 'string' ? req.body.title.trim() : '';
      if (!titleRaw) {
        return res.status(400).json({ error: 'title_required' });
      }
      if (titleRaw.length > 120) {
        return res.status(400).json({ error: 'title_too_long' });
      }
      updates.push(`title = $${values.length + 1}`);
      values.push(titleRaw);
    }

    if (hasDescription) {
      const descriptionRaw =
        typeof req.body?.description === 'string' ? req.body.description.trim() : '';
      const description = descriptionRaw.length > 0 ? descriptionRaw : null;
      if (description && description.length > 500) {
        return res.status(400).json({ error: 'description_too_long' });
      }
      updates.push(`description = $${values.length + 1}`);
      values.push(description);
    }

    if (hasTags && tags.length > maxListTags) {
      return res.status(400).json({ error: 'tags_too_many' });
    }

    if (hasTags && tags.some((tag) => tag.length > maxListTagLength)) {
      return res.status(400).json({ error: 'tag_too_long' });
    }

    let listRow = listResult.rows[0];

    if (updates.length > 0) {
      values.push(listId);
      const result = await pool.query(
        `UPDATE lists
         SET ${updates.join(', ')}
         WHERE id = $${values.length}
         RETURNING id, title, description, is_ranked, created_at`,
        values
      );
      if (result.rows.length > 0) {
        listRow = result.rows[0];
      }
    } else if (!hasTags) {
      return res.status(400).json({ error: 'update_required' });
    }

    if (hasTags) {
      await pool.query('DELETE FROM list_tags WHERE list_id = $1', [listId]);
      if (tags.length > 0) {
        const tagValues = [listId, ...tags];
        const placeholders = tags
          .map((_, index) => `($1, $${index + 2})`)
          .join(', ');
        await pool.query(
          `INSERT INTO list_tags (list_id, tag)
           VALUES ${placeholders}
           ON CONFLICT (list_id, tag) DO NOTHING`,
          tagValues
        );
      }
    }

    const tagResult = await pool.query(
      'SELECT tag FROM list_tags WHERE list_id = $1 ORDER BY tag',
      [listId]
    );

    return res.json({
      list: {
        ...listRow,
        tags: tagResult.rows.map((row) => row.tag),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'list_update_failed' });
  }
});

app.post('/lists/:id/items', requireAuth, async (req, res) => {
  const listId = parseInt(req.params.id, 10);
  const albumRaw =
    typeof req.body?.spotify_album_id === 'string'
      ? req.body.spotify_album_id.trim()
      : '';

  if (!listId) {
    return res.status(400).json({ error: 'list_id_required' });
  }

  if (!albumRaw) {
    return res.status(400).json({ error: 'album_id_required' });
  }

  if (!isValidSpotifyId(albumRaw)) {
    return res.status(400).json({ error: 'invalid_album_id' });
  }

  try {
    const listResult = await pool.query(
      'SELECT id FROM lists WHERE id = $1 AND user_id = $2',
      [listId, req.user.sub]
    );

    if (listResult.rows.length === 0) {
      return res.status(404).json({ error: 'list_not_found' });
    }

    const appToken = await getAppAccessToken();
    const validationResponse = await fetch(
      `https://api.spotify.com/v1/albums/${albumRaw}`,
      { headers: { Authorization: `Bearer ${appToken}` } }
    );

    if (validationResponse.status === 400 || validationResponse.status === 404) {
      return res.status(400).json({ error: 'invalid_album_id' });
    }

    if (!validationResponse.ok) {
      const details = await validationResponse.text();
      console.error('Spotify album validation failed:', details);
      return res.status(503).json({ error: 'spotify_unavailable' });
    }

    const positionResult = await pool.query(
      'SELECT COALESCE(MAX(position), 0) AS max_position FROM list_items WHERE list_id = $1',
      [listId]
    );
    const nextPosition = Number(positionResult.rows[0]?.max_position || 0) + 1;

    await pool.query(
      `INSERT INTO list_items (list_id, spotify_album_id, position)
       VALUES ($1, $2, $3)
       ON CONFLICT (list_id, spotify_album_id) DO NOTHING`,
      [listId, albumRaw, nextPosition]
    );

    return res.status(201).json({
      item: {
        list_id: listId,
        spotify_album_id: albumRaw,
        position: nextPosition,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'list_item_create_failed' });
  }
});

app.post('/lists/:id/reorder', requireAuth, async (req, res) => {
  const listId = parseInt(req.params.id, 10);
  const orderRaw = Array.isArray(req.body?.order) ? req.body.order : [];
  const order = orderRaw
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (!listId) {
    return res.status(400).json({ error: 'list_id_required' });
  }

  if (order.length === 0) {
    return res.status(400).json({ error: 'order_required' });
  }

  if (order.some((id) => !isValidSpotifyId(id))) {
    return res.status(400).json({ error: 'invalid_album_id' });
  }

  if (new Set(order).size !== order.length) {
    return res.status(400).json({ error: 'order_duplicate' });
  }

  try {
    const listResult = await pool.query(
      'SELECT id FROM lists WHERE id = $1 AND user_id = $2',
      [listId, req.user.sub]
    );

    if (listResult.rows.length === 0) {
      return res.status(404).json({ error: 'list_not_found' });
    }

    const itemResult = await pool.query(
      'SELECT spotify_album_id FROM list_items WHERE list_id = $1',
      [listId]
    );
    const existingIds = itemResult.rows.map((row) => row.spotify_album_id);

    if (existingIds.length !== order.length) {
      return res.status(400).json({ error: 'order_mismatch' });
    }

    const existingSet = new Set(existingIds);
    const missing = order.some((id) => !existingSet.has(id));
    if (missing) {
      return res.status(400).json({ error: 'order_mismatch' });
    }

    const total = order.length;
    const values = [listId];
    const cases = [];

    order.forEach((albumId, index) => {
      const idParam = values.length + 1;
      values.push(albumId);
      const positionParam = values.length + 1;
      values.push(total - index);
      cases.push(`WHEN $${idParam} THEN $${positionParam}`);
    });

    const updateQuery = `
      UPDATE list_items
      SET position = CASE spotify_album_id
        ${cases.join(' ')}
        ELSE position
      END
      WHERE list_id = $1
    `;

    await pool.query(updateQuery, values);
    return res.json({ status: 'ok' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'list_reorder_failed' });
  }
});

app.post('/lists/:id/like', requireAuth, async (req, res) => {
  const listId = parseInt(req.params.id, 10);

  if (!listId) {
    return res.status(400).json({ error: 'list_id_required' });
  }

  try {
    const listResult = await pool.query(
      'SELECT id FROM lists WHERE id = $1',
      [listId]
    );

    if (listResult.rows.length === 0) {
      return res.status(404).json({ error: 'list_not_found' });
    }

    await pool.query(
      `INSERT INTO list_likes (list_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (list_id, user_id) DO NOTHING`,
      [listId, req.user.sub]
    );

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM list_likes WHERE list_id = $1',
      [listId]
    );
    const likesCount = parseInt(countResult.rows[0]?.count || '0', 10);

    return res.json({ status: 'ok', likes_count: likesCount, liked_by_me: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'list_like_failed' });
  }
});

app.delete('/lists/:id/like', requireAuth, async (req, res) => {
  const listId = parseInt(req.params.id, 10);

  if (!listId) {
    return res.status(400).json({ error: 'list_id_required' });
  }

  try {
    const listResult = await pool.query(
      'SELECT id FROM lists WHERE id = $1',
      [listId]
    );

    if (listResult.rows.length === 0) {
      return res.status(404).json({ error: 'list_not_found' });
    }

    await pool.query(
      'DELETE FROM list_likes WHERE list_id = $1 AND user_id = $2',
      [listId, req.user.sub]
    );

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM list_likes WHERE list_id = $1',
      [listId]
    );
    const likesCount = parseInt(countResult.rows[0]?.count || '0', 10);

    return res.json({ status: 'ok', likes_count: likesCount, liked_by_me: false });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'list_unlike_failed' });
  }
});

app.get('/lists/:id/comments', requireAuth, async (req, res) => {
  const listId = parseInt(req.params.id, 10);
  const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const limit = Math.min(Math.max(parseInt(limitRaw || '50', 10), 1), 100);

  if (!listId) {
    return res.status(400).json({ error: 'list_id_required' });
  }

  try {
    const listResult = await pool.query(
      'SELECT id FROM lists WHERE id = $1 AND user_id = $2',
      [listId, req.user.sub]
    );

    if (listResult.rows.length === 0) {
      return res.status(404).json({ error: 'list_not_found' });
    }

    const commentResult = await pool.query(
      `SELECT c.id, c.body, c.created_at,
              u.id AS user_id, u.display_name, u.spotify_id, u.avatar_url
       FROM list_comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.list_id = $1
       ORDER BY c.created_at DESC
       LIMIT $2`,
      [listId, limit]
    );

    const comments = commentResult.rows.map((row) => ({
      id: row.id,
      body: row.body,
      created_at: row.created_at,
      user: {
        id: row.user_id,
        display_name: row.display_name,
        spotify_id: row.spotify_id,
        avatar_url: row.avatar_url,
      },
    }));

    return res.json({ comments });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'list_comments_fetch_failed' });
  }
});

app.post('/lists/:id/comments', requireAuth, async (req, res) => {
  const listId = parseInt(req.params.id, 10);
  const bodyRaw = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  const body = bodyRaw.length > 0 ? bodyRaw : null;

  if (!listId) {
    return res.status(400).json({ error: 'list_id_required' });
  }

  if (!body) {
    return res.status(400).json({ error: 'comment_required' });
  }

  if (body.length > 1000) {
    return res.status(400).json({ error: 'comment_too_long' });
  }

  try {
    const listResult = await pool.query(
      'SELECT id FROM lists WHERE id = $1 AND user_id = $2',
      [listId, req.user.sub]
    );

    if (listResult.rows.length === 0) {
      return res.status(404).json({ error: 'list_not_found' });
    }

    const result = await pool.query(
      `INSERT INTO list_comments (list_id, user_id, body)
       VALUES ($1, $2, $3)
       RETURNING id, body, created_at`,
      [listId, req.user.sub, body]
    );

    const userResult = await pool.query(
      'SELECT id, display_name, spotify_id, avatar_url FROM users WHERE id = $1',
      [req.user.sub]
    );
    const userRow = userResult.rows[0] || {};

    return res.status(201).json({
      comment: {
        id: result.rows[0].id,
        body: result.rows[0].body,
        created_at: result.rows[0].created_at,
        user: {
          id: userRow.id || req.user.sub,
          display_name: userRow.display_name || null,
          spotify_id: userRow.spotify_id || null,
          avatar_url: userRow.avatar_url || null,
        },
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'list_comment_create_failed' });
  }
});

app.delete('/lists/:id', requireAuth, async (req, res) => {
  const listId = parseInt(req.params.id, 10);

  if (!listId) {
    return res.status(400).json({ error: 'list_id_required' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM lists WHERE id = $1 AND user_id = $2 RETURNING id',
      [listId, req.user.sub]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'list_not_found' });
    }

    return res.json({ status: 'ok' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'list_delete_failed' });
  }
});

app.get('/lists/:id', requireAuth, async (req, res) => {
  const listId = parseInt(req.params.id, 10);

  if (!listId) {
    return res.status(400).json({ error: 'list_id_required' });
  }

  try {
    const listResult = await pool.query(
      `SELECT l.id, l.title, l.description, l.is_ranked, l.created_at,
              COALESCE((SELECT COUNT(*) FROM list_likes WHERE list_id = l.id), 0) AS likes_count,
              EXISTS(
                SELECT 1 FROM list_likes
                WHERE list_id = l.id AND user_id = $2
              ) AS liked_by_me
       FROM lists l
       WHERE l.id = $1 AND l.user_id = $2`,
      [listId, req.user.sub]
    );

    if (listResult.rows.length === 0) {
      return res.status(404).json({ error: 'list_not_found' });
    }

    const listRow = listResult.rows[0];
    const list = {
      ...listRow,
      likes_count: parseInt(listRow.likes_count, 10) || 0,
      liked_by_me: listRow.liked_by_me === true,
    };

    const itemResult = await pool.query(
      `SELECT spotify_album_id, created_at, position
       FROM list_items
       WHERE list_id = $1
       ORDER BY position DESC, created_at DESC`,
      [listId]
    );

    list.items = itemResult.rows.map((row) => ({
      spotify_album_id: row.spotify_album_id,
      created_at: row.created_at,
      position: row.position,
    }));

    const tagResult = await pool.query(
      'SELECT tag FROM list_tags WHERE list_id = $1 ORDER BY tag',
      [listId]
    );
    list.tags = tagResult.rows.map((row) => row.tag);

    return res.json({ list });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'list_fetch_failed' });
  }
});

app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});
