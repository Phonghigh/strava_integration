import { Activity } from "../models/Activity.model.js";
import { User } from "../models/User.model.js";
import mongoose from "mongoose";
import { syncClubData } from "../services/sync.service.js";

/**
 * GET /api/v1/leaderboard/individuals
 * Query Params: page, limit, gender (optional future standard)
 */
export const getIndividualsLeaderboard = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const leaderboard = await Activity.aggregate([
      // A. Only valid activities count towards the leaderboard
      { $match: { isValid: true } },
      
      // B. Group by user
      {
        $group: {
          _id: "$userId",
          distance: { $sum: "$distance" },
          activitiesCount: { $sum: 1 }
        }
      },
      // C. Lookup User details
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "athlete"
        }
      },
      { $unwind: "$athlete" },
      
      // D. Clean up format per specification
      {
        $project: {
          _id: 0,
          userId: "$_id",
          name: { $concat: ["$athlete.firstName", " ", "$athlete.lastName"] },
          avatar: "$athlete.profile",
          location: "$athlete.location", // Added location to leaderboard
          distance: { $divide: ["$distance", 1000] }, // Convert to Km
          activitiesCount: 1
        }
      },
      // E. Sort by Highest Distance
      { $sort: { distance: -1 } },
      
      // F. Apply Pagination
      { $skip: skip },
      { $limit: limit }
    ]);

    // To add ranks locally in JS:
    const rankedLeaderboard = leaderboard.map((item, index) => ({
      rank: skip + index + 1,
      ...item,
      name: item.name.trim()
    }));

    res.json(rankedLeaderboard);
  } catch (err) {
    console.error("[Individuals Leaderboard Error]:", err.message);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
};

/**
 * GET /api/v1/leaderboard/teams
 */
export const getTeamLeaderboard = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const teamsData = await User.aggregate([
      // Lookup Valid Activities for each user
      {
        $lookup: {
          from: "activities",
          localField: "_id",
          foreignField: "userId",
          pipeline: [
            { $match: { isValid: true } }
          ],
          as: "userActivities"
        }
      },
      // Calculate total distance for this user implicitly
      {
        $addFields: {
          userTotalDistance: { $sum: "$userActivities.distance" }
        }
      },
      // Group by teamName
      {
        $group: {
          _id: "$teamName", 
          totalDistance: { $sum: "$userTotalDistance" },
          memberCount: { $sum: 1 }
        }
      },
      // Format output
      {
        $project: {
          _id: 0,
          teamId: { $ifNull: ["$_id", "No Team"] }, 
          totalDistance: { $divide: ["$totalDistance", 1000] }, // To Km
          memberCount: 1
        }
      },
      // Sort highest team distance first
      { $sort: { totalDistance: -1 } },
      
      { $skip: skip },
      { $limit: limit }
    ]);

    const rankedTeams = teamsData.map((item, index) => ({
      rank: skip + index + 1,
      name: item.teamId,
      ...item
    }));

    res.json(rankedTeams);
  } catch (err) {
    console.error("[Team Leaderboard Error]:", err.message);
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
    const result = await syncClubData();
    res.json({ message: "Full club sync complete", ...result });
  } catch (err) {
    console.error("[triggerSync] Error:", err.message);
    res.status(500).json({ error: "Failed to sync club activities" });
  }
};
