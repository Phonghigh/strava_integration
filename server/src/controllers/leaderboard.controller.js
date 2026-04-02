// src/controllers/leaderboard.controller.js
import { Activity } from "../models/Activity.model.js";
import { syncAllUsersActivities } from "../services/sync.service.js";

/**
 * GET /api/leaderboard
 * Returns aggregated leaderboard data ranked by total distance.
 * This does not require any auth since it reads from the public DB.
 */
export const getLeaderboard = async (req, res) => {
  try {
    // Aggregate activities by userId, summing up distance & movingTime
    const leaderboard = await Activity.aggregate([
      {
        $group: {
          _id: "$userId",
          totalDistance: { $sum: "$distance" },
          totalMovingTime: { $sum: "$movingTime" },
          activityCount: { $sum: 1 },
        }
      },
      // Sort by totalDistance descending (highest first)
      { $sort: { totalDistance: -1 } },
      
      // Lookup the User details to get name and profile pic
      {
        $lookup: {
          from: "users", // the underlying mongo collection name for "User"
          localField: "_id",
          foreignField: "_id",
          as: "athlete"
        }
      },
      { $unwind: "$athlete" },
      
      // Project only necessary fields back to frontend
      {
        $project: {
          _id: 0,
          userId: "$_id",
          firstName: "$athlete.firstName",
          lastName: "$athlete.lastName",
          profile: "$athlete.profile",
          totalDistance: 1,
          totalMovingTime: 1,
          activityCount: 1,
        }
      }
    ]);

    res.json(leaderboard);
  } catch (err) {
    console.error("[getLeaderboard] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
};

/**
 * GET /api/sync
 * Manually trigger a database sync for all users.
 * Ideally, hit this endpoint via Vercel Cron.
 */
export const triggerSync = async (req, res) => {
  try {
    const result = await syncAllUsersActivities();
    res.json({ message: "Sync complete", ...result });
  } catch (err) {
    console.error("[triggerSync] Error:", err.message);
    res.status(500).json({ error: "Failed to sync activities" });
  }
};
