// src/services/strava.service.js
import axios from "axios";
import { User } from "../models/User.model.js";

const STRAVA_API = "https://www.strava.com/api/v3";
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";

export const exchangeTokenAndSaveUser = async (code) => {
  // 1. Exchange code
  const res = await axios.post(STRAVA_TOKEN_URL, {
    client_id: process.env.STRAVA_CLIENT_ID,
    client_secret: process.env.STRAVA_CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
  });

  const data = res.data;
  const athlete = data.athlete;

  // 2. Find or create user
  const user = await User.findOneAndUpdate(
    { stravaId: athlete.id.toString() },
    {
      firstName: athlete.firstname,
      lastName: athlete.lastname,
      profile: athlete.profile,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenExpiresAt: data.expires_at,
      isAuthorized: true,
    },
    { new: true, upsert: true }
  );

  return user;
};

export const refreshTokenIfNeeded = async (user) => {
  const now = Math.floor(Date.now() / 1000);

  // Buffer of 5 minutes just to be safe
  if (user.tokenExpiresAt < now + 300) {
    const res = await axios.post(STRAVA_TOKEN_URL, {
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: user.refreshToken,
    });

    user.accessToken = res.data.access_token;
    user.refreshToken = res.data.refresh_token;
    user.tokenExpiresAt = res.data.expires_at;
    await user.save();
  }

  return user.accessToken;
};

export const getActivitiesForUser = async (user) => {
  const access_token = await refreshTokenIfNeeded(user);

  const res = await axios.get(`${STRAVA_API}/athlete/activities`, {
    headers: { Authorization: `Bearer ${access_token}` },
    params: { per_page: 30 },
  });

  return res.data;
};

export const getAthleteForUser = async (user) => {
  const access_token = await refreshTokenIfNeeded(user);

  const res = await axios.get(`${STRAVA_API}/athlete`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  return res.data;
};

export const getDetailedActivity = async (user, stravaId) => {
  const access_token = await refreshTokenIfNeeded(user);

  const res = await axios.get(`${STRAVA_API}/activities/${stravaId}`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  return res.data;
};

export const getActivityStreams = async (user, stravaId) => {
  const access_token = await refreshTokenIfNeeded(user);

  const res = await axios.get(`${STRAVA_API}/activities/${stravaId}/streams`, {
    headers: { Authorization: `Bearer ${access_token}` },
    params: {
      keys: "time,distance,latlng,altitude,velocity_smooth,heartrate,cadence,watts,temp,moving,grade_smooth",
      key_by_type: true
    },
  });

  return res.data;
};

export const getActivityLaps = async (user, stravaId) => {
  const access_token = await refreshTokenIfNeeded(user);

  const res = await axios.get(`${STRAVA_API}/activities/${stravaId}/laps`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  return res.data;
};

