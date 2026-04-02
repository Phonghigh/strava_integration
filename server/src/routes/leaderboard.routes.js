// src/routes/leaderboard.routes.js
import express from "express";
import { 
  getLeaderboard, 
  getTeamLeaderboard, 
  getAthleteDetail, 
  triggerSync 
} from "../controllers/leaderboard.controller.js";

const router = express.Router();

// Get aggregated teams leaderboard
router.get("/teams", getTeamLeaderboard);

// Trigger a manual sync from Strava API to DB
router.get("/sync", triggerSync);

// Get specific member detail & activities
router.get("/athlete/:id", getAthleteDetail);

// Fetch the overall leaderboard data (Main Board + Search)
// Put this last so it doesn't conflict with /teams or /sync
router.get("/", getLeaderboard);

export default router;
