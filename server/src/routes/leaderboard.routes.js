// src/routes/leaderboard.routes.js
import express from "express";
import { getLeaderboard, triggerSync } from "../controllers/leaderboard.controller.js";

const router = express.Router();

// Fetch the overall leaderboard data (grouped per user)
router.get("/", getLeaderboard);

// Trigger a manual sync from Strava API to DB
router.get("/sync", triggerSync);

export default router;
