// src/controllers/leaderboard.controller.js
import { Activity } from "../models/Activity.model.js";
import { User } from "../models/User.model.js";
import { syncAllUsersActivities } from "../services/sync.service.js";
import mongoose from "mongoose";

/**
 * GET /api/leaderboard
 * Query Params:
 *  - search (optional): filter by firstName, lastName, or teamName
 */
export const getLeaderboard = async (req, res) => {
  try {
    const { search } = req.query;
    
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // 1. First get total distance across the entire challenge (all activities)
    const totalResult = await Activity.aggregate([
      { $group: { _id: null, totalKm: { $sum: "$distance" } } }
    ]);
    const challengeTotalKm = totalResult[0]?.totalKm || 0;

    // 2. Build the user match filter (for Search step)
    let userMatch = {};
    if (search) {
      const regex = new RegExp(search, "i"); // case-insensitive
      userMatch = {
        $or: [
          { "athlete.firstName": regex },
          { "athlete.lastName": regex },
          { "athlete.teamName": regex }
        ]
      };
    }

    // 3. Aggregate leaderboard data
    const leaderboard = await Activity.aggregate([
      // A. Calculate stats per user
      {
        $group: {
          _id: "$userId",
          totalDistance: { $sum: "$distance" },
          totalMovingTime: { $sum: "$movingTime" },
          activityCount: { $sum: 1 },
          last24hDistance: {
            $sum: {
              $cond: [{ $gte: ["$startDate", twentyFourHoursAgo] }, "$distance", 0]
            }
          }
        }
      },
      // B. Lookup User details
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "athlete"
        }
      },
      { $unwind: "$athlete" },
      
      // C. Filter based on Search Query
      { $match: userMatch },
      
      // D. Clean up format
      {
        $project: {
          _id: 0,
          userId: "$_id",
          firstName: "$athlete.firstName",
          lastName: "$athlete.lastName",
          teamName: "$athlete.teamName",
          profile: "$athlete.profile",
          totalDistance: 1,
          totalMovingTime: 1,
          activityCount: 1,
          last24hDistance: 1
        }
      },
      // E. Sort by Highest Distance
      { $sort: { totalDistance: -1 } }
    ]);

    res.json({
      challengeTotalKm,
      leaderboard
    });
  } catch (err) {
    console.error("[getLeaderboard] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
};

/**
 * GET /api/leaderboard/teams
 * Returns stats grouped by teamName.
 */
export const getTeamLeaderboard = async (req, res) => {
  try {
    const teamsData = await User.aggregate([
      // Lookup Activities for each user
      {
        $lookup: {
          from: "activities",
          localField: "_id",
          foreignField: "userId",
          as: "userActivities"
        }
      },
      // Calculate total distance for this user implicitly
      {
        $addFields: {
          userTotalDistance: { $sum: "$userActivities.distance" },
          userTotalTime: { $sum: "$userActivities.movingTime" }
        }
      },
      // Group by teamName
      {
        $group: {
          _id: "$teamName", // _id is now the teamName (can be null)
          totalDistance: { $sum: "$userTotalDistance" },
          totalMovingTime: { $sum: "$userTotalTime" },
          memberCount: { $sum: 1 }
        }
      },
      // Format output
      {
        $project: {
          _id: 0,
          teamName: { $ifNull: ["$_id", "No Team"] }, // If teamName is null, return "No Team"
          totalDistance: 1,
          totalMovingTime: 1,
          memberCount: 1
        }
      },
      // Sort highest team distance first
      { $sort: { totalDistance: -1 } }
    ]);

    res.json(teamsData);
  } catch (err) {
    console.error("[getTeamLeaderboard] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch team leaderboard" });
  }
};

/**
 * GET /api/leaderboard/athlete/:id
 * Returns detail of one athlete and their activities list.
 */
export const getAthleteDetail = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid User ID" });
    }

    const user = await User.findById(id).select("-accessToken -refreshToken -tokenExpiresAt");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const activities = await Activity.find({ userId: id }).sort({ startDate: -1 });

    const totalDistance = activities.reduce((sum, act) => sum + act.distance, 0);

    res.json({
      athlete: user,
      stats: {
        activityCount: activities.length,
        totalDistance
      },
      activities
    });
  } catch (err) {
    console.error("[getAthleteDetail] Error:", err.message);
    res.status(500).json({ error: "Failed to fetch athlete detail" });
  }
};

/**
 * GET /api/leaderboard/sync
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
