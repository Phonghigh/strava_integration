// src/services/strava.service.js
// Core Strava API logic: OAuth token exchange, refresh, and data fetching

import axios from "axios";
import { getToken, saveToken } from "../utils/tokenStore.js";

const STRAVA_API = "https://www.strava.com/api/v3";
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";

/**
 * Exchange the OAuth authorization code for access + refresh tokens.
 * Called once after the user completes the Strava consent screen.
 */
export const exchangeToken = async (code) => {
  const res = await axios.post(STRAVA_TOKEN_URL, {
    client_id: process.env.STRAVA_CLIENT_ID,
    client_secret: process.env.STRAVA_CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
  });

  saveToken(res.data);
  return res.data;
};

/**
 * Return a valid access token, refreshing automatically if it has expired.
 */
export const refreshTokenIfNeeded = async () => {
  const token = getToken();
  if (!token) throw new Error("No token found — user must connect Strava first");

  const now = Math.floor(Date.now() / 1000);

  if (token.expires_at < now) {
    const res = await axios.post(STRAVA_TOKEN_URL, {
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
    });

    saveToken(res.data);
    return res.data.access_token;
  }

  return token.access_token;
};

/**
 * Fetch the authenticated athlete's recent activities (up to 30).
 */
export const getActivities = async () => {
  const access_token = await refreshTokenIfNeeded();

  const res = await axios.get(`${STRAVA_API}/athlete/activities`, {
    headers: { Authorization: `Bearer ${access_token}` },
    params: { per_page: 30 },
  });

  return res.data;
};

/**
 * Fetch the authenticated athlete's profile.
 */
export const getAthlete = async () => {
  const access_token = await refreshTokenIfNeeded();

  const res = await axios.get(`${STRAVA_API}/athlete`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  return res.data;
};
