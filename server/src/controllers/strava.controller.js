// src/controllers/strava.controller.js

import { exchangeTokenAndSaveUser } from "../services/strava.service.js";
import { syncAllUsersActivities } from "../services/sync.service.js";

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
 * Handles the OAuth redirect from Strava.
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

    // 1. Exchange token and save/update the user in MongoDB
    const user = await exchangeTokenAndSaveUser(code);
    
    // 2. Trigger an immediate background sync for this user to get their initial data
    syncAllUsersActivities().catch(err => console.error("Initial sync error:", err));

    res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
  } catch (err) {
    console.error("[callback] Token exchange failed:", err.message);
    res.status(500).json({ error: err.message });
  }
};
