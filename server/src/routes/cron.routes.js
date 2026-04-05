import express from "express";
import { syncClubData } from "../services/sync.service.js";

const router = express.Router();

/**
 * @route   GET /api/v1/cron/club-sync
 * @desc    Triggers the Strava Club Synchronization (intended for Vercel Crons)
 * @access  Public (should probably be secured via a secret header in production)
 */
router.get("/club-sync", async (req, res) => {
  // Check for authorization header if needed
  // Vercel Crons send a specific header: CRON_SECRET or similar if configured
  // For now we keep it simple as per user request to "add cron job"
  
  try {
    console.log("[Cron] Triggering Club Sync...");
    const result = await syncClubData({ runPhase1: true, runPhase2: true, fullSync: false });
    
    return res.status(200).json({
      success: true,
      message: "Club synchronization completed successfully",
      data: result
    });
  } catch (error) {
    console.error("[Cron] Error during club sync:", error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
