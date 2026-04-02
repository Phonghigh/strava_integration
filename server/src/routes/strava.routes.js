// src/routes/strava.routes.js
// Mounts all Strava endpoints under /api/strava (see app.js)

import express from "express";
import {
  connectStrava,
  callback,
  activities,
  athlete,
} from "../controllers/strava.controller.js";

const router = express.Router();

// OAuth flow
router.get("/connect", connectStrava);   // Step 1: redirect to Strava
router.get("/callback", callback);       // Step 2: Strava redirects back here

// Protected data endpoints
router.get("/activities", activities);   // Returns last 30 activities
router.get("/athlete", athlete);         // Returns athlete profile

export default router;
