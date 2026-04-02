// src/controllers/strava.controller.js

import { exchangeTokenAndSaveUser } from "../services/strava.service.js";
import { syncAllUsersActivities } from "../services/sync.service.js";

/**
 * GET /api/strava/connect
 * Redirects the user to Strava's OAuth consent screen.
 */
export const connectStrava = (req, res) => {
  // Capture optional redirectUrl to return to the specific frontend deployment
  const frontendRedirect = req.query.redirectUrl || process.env.FRONTEND_URL;

  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID,
    response_type: "code",
    redirect_uri: process.env.STRAVA_REDIRECT_URI,
    approval_prompt: "force",
    scope: "read,activity:read_all",
    state: frontendRedirect, // Pass the target URL as state
  });

  res.redirect(`https://www.strava.com/oauth/authorize?${params}`);
};

/**
 * GET /api/strava/callback
 * Handles the OAuth redirect from Strava.
 */
export const callback = async (req, res) => {
  try {
    const { code, error, state } = req.query;
    
    // Determine where to redirect back to (state is our passed redirectUrl)
    const finalFrontendUrl = state || process.env.FRONTEND_URL;

    if (error) {
      return res.redirect(`${finalFrontendUrl}/?error=${error}`);
    }

    if (!code) {
      return res.status(400).json({ error: "Missing authorization code" });
    }

    // 1. Exchange token and save/update the user in MongoDB
    console.log(`[Strava] Exchange token process started for code: ${code}`);
    const user = await exchangeTokenAndSaveUser(code);
    console.log(`[Strava] User saved to DB! Name: ${user.firstName} ${user.lastName}`);
    
    // 2. Trigger an immediate background sync for this user to get their initial data
    console.log(`[Sync] Background sync triggered instantly...`);
    syncAllUsersActivities()
      .then(res => console.log(`[Sync] Background sync COMPLETED.`, res))
      .catch(err => console.error("[Sync] Initial sync error:", err));

    // Redirect back to the dynamic frontend URL (fallback to dashboard if path not specified)
    // If state was just a base URL, we append /dashboard
    const redirectPath = finalFrontendUrl.includes("/dashboard") ? finalFrontendUrl : `${finalFrontendUrl}/dashboard`;
    res.redirect(redirectPath);
  } catch (err) {
    console.error("[callback] Token exchange failed:", err.message);
    res.status(500).json({ error: err.message });
  }
};
