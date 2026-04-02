// src/routes/strava.routes.js

import express from "express";
import { connectStrava, callback } from "../controllers/strava.controller.js";

const router = express.Router();

// OAuth flow
router.get("/connect", connectStrava);   // Step 1: redirect to Strava
router.get("/login", connectStrava);     // Alias for /connect
router.get("/callback", callback);       // Step 2: Strava redirects back here

export default router;
