const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

if (!clientId || !clientSecret || !redirectUri) {
  throw new Error('SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REDIRECT_URI are required');
}

const scopes = ['user-read-email', 'user-read-private'];

function getAuthorizeUrl(state) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
  });

  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Spotify token exchange failed: ${response.status} ${details}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

let appAccessToken = null;
let appAccessTokenExpiresAt = 0;

async function getAppAccessToken() {
  const now = Date.now();
  if (appAccessToken && now < appAccessTokenExpiresAt - 60_000) {
    return appAccessToken;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
  });

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Spotify client token failed: ${response.status} ${details}`);
  }

  const data = await response.json();
  appAccessToken = data.access_token;
  appAccessTokenExpiresAt = now + data.expires_in * 1000;
  return appAccessToken;
}

async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Spotify token refresh failed: ${response.status} ${details}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresIn: data.expires_in,
  };
}

async function fetchSpotifyProfile(accessToken) {
  const response = await fetch('https://api.spotify.com/v1/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Spotify profile request failed: ${response.status} ${details}`);
  }

  return response.json();
}

async function fetchSpotifyJson(accessToken, url) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Spotify API request failed: ${response.status} ${details}`);
  }

  return response.json();
}

// Spotify removed `preview_url` from the Web API in late 2024, but the public
// embed page still exposes a 30s preview MP3. Scrape it as a fallback for tracks
// whose API `preview_url` is null. Undocumented, so it may break if the embed
// page format changes — callers should treat a null result as "no preview".
async function fetchTrackPreviewUrl(trackId) {
  const response = await fetch(`https://open.spotify.com/embed/track/${trackId}`, {
    headers: {
      // A browser-like UA avoids the occasional bot-challenge response.
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`Spotify embed request failed: ${response.status}`);
  }

  const html = await response.text();
  let url = null;
  const jsonMatch = html.match(/"audioPreview"\s*:\s*\{\s*"url"\s*:\s*"([^"]+)"/);
  if (jsonMatch) {
    url = jsonMatch[1];
  } else {
    const rawMatch = html.match(/https:\\?\/\\?\/p\.scdn\.co\\?\/mp3-preview\\?\/[A-Za-z0-9]+/);
    url = rawMatch ? rawMatch[0] : null;
  }

  return url ? url.replace(/\\\//g, '/') : null;
}

module.exports = {
  getAuthorizeUrl,
  exchangeCodeForToken,
  getAppAccessToken,
  refreshAccessToken,
  fetchSpotifyProfile,
  fetchSpotifyJson,
  fetchTrackPreviewUrl,
};
