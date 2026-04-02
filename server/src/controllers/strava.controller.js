// src/controllers/strava.controller.js
// HTTP handlers — thin layer that delegates to the service

import {
  exchangeToken,
  getActivities,
  getAthlete,
} from "../services/strava.service.js";

/**
 * GET /api/strava/connect
 * Redirects the user to Strava's OAuth consent screen.
 */
export const connectStrava = (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID,
    response_type: "code",
    redirect_uri: process.env.STRAVA_REDIRECT_URI,
    approval_prompt: "force",
    scope: "read,activity:read_all",
  });

  res.redirect(`https://www.strava.com/oauth/authorize?${params}`);
};

/**
 * GET /api/strava/callback
 * Handles the OAuth redirect from Strava, exchanges the code for tokens,
 * then sends the user back to the frontend dashboard.
 */
export const callback = async (req, res) => {
  try {
    const { code, error } = req.query;

    if (error) {
      return res.redirect(`${process.env.FRONTEND_URL}/?error=${error}`);
    }

    if (!code) {
      return res.status(400).json({ error: "Missing authorization code" });
    }

    await exchangeToken(code);
    res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
  } catch (err) {
    console.error("[callback] Token exchange failed:", err.message);
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/strava/activities
 * Returns the authenticated athlete's recent 30 activities as JSON.
 */
export const activities = async (req, res) => {
  try {
    const data = await getActivities();
    res.json(data);
  } catch (err) {
    console.error("[activities] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/strava/athlete
 * Returns the authenticated athlete's profile as JSON.
 */
export const athlete = async (req, res) => {
  try {
    const data = await getAthlete();
    res.json(data);
  } catch (err) {
    console.error("[athlete] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
};
