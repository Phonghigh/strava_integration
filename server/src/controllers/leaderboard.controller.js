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
    const { startDate, endDate } = req.query;

    const matchQuery = { isValid: true };
    if (startDate || endDate) {
      matchQuery.startDate = {};
      if (startDate) matchQuery.startDate.$gte = new Date(startDate);
      if (endDate) matchQuery.startDate.$lte = new Date(endDate);
    }

    // F. Apply Pagination
    const leaderboard = await Activity.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: "$userId",
          distance: { $sum: "$distance" },
          activitiesCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "athlete"
        }
      },
      { $unwind: "$athlete" },
      {
        $project: {
          _id: 0,
          userId: "$_id",
          name: { $concat: ["$athlete.firstName", " ", "$athlete.lastName"] },
          avatar: "$athlete.profile",
          location: "$athlete.location",
          distance: { $divide: ["$distance", 1000] },
          activitiesCount: 1
        }
      },
      { $sort: { distance: -1 } },
      { $skip: skip },
      { $limit: limit }
    ]);

    // G. Total Count for pagination meta
    const totalCountResult = await Activity.aggregate([
      { $match: matchQuery },
      { $group: { _id: "$userId" } },
      { $count: "total" }
    ]);

    const total = totalCountResult[0]?.total || 0;

    // H. Add ranks locally in JS
    const rankedLeaderboard = leaderboard.map((item, index) => ({
      rank: skip + index + 1,
      ...item,
      name: (item.name || "").trim()
    }));

    res.json({
      data: rankedLeaderboard,
      meta: {
        total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        limit
      }
    });
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
    const { startDate, endDate } = req.query;

    const matchQuery = { isValid: true };
    if (startDate || endDate) {
      matchQuery.startDate = {};
      if (startDate) matchQuery.startDate.$gte = new Date(startDate);
      if (endDate) matchQuery.startDate.$lte = new Date(endDate);
    }

    // Execute Team Leaderboard aggregation
    const teamsData = await User.aggregate([
      {
        $lookup: {
          from: "activities",
          localField: "_id",
          foreignField: "userId",
          pipeline: [{ $match: matchQuery }],
          as: "userActivities"
        }
      },
      {
        $addFields: {
          userTotalDistance: { $sum: "$userActivities.distance" }
        }
      },
      {
        $group: {
          _id: "$teamName", 
          totalDistance: { $sum: "$userTotalDistance" },
          memberCount: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          teamId: { $ifNull: ["$_id", "No Team"] }, 
          totalDistance: { $divide: ["$totalDistance", 1000] },
          memberCount: 1
        }
      },
      { $sort: { totalDistance: -1 } },
      { $skip: skip },
      { $limit: limit }
    ]);

    // Calculate total teams for metadata
    const totalTeamsResult = await User.aggregate([
      { $group: { _id: "$teamName" } },
      { $count: "total" }
    ]);

    const total = totalTeamsResult[0]?.total || 0;

    const rankedTeams = teamsData.map((item, index) => ({
      rank: skip + index + 1,
      name: item.teamId,
      ...item
    }));

    res.json({
      data: rankedTeams,
      meta: {
        total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        limit
      }
    });
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
