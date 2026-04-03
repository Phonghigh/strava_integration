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
    let limitInput = req.query.limit;
    let limit;
    
    if (limitInput === "all") {
      limit = 999999;
    } else {
      limit = parseInt(limitInput) || 50;
    }
    
    const skip = (page - 1) * limit;
    const { startDate: qStart, endDate: qEnd, timeframe } = req.query;

    let startDate = qStart ? new Date(qStart) : new Date("2026-04-01T00:00:00Z");
    let endDate = qEnd ? new Date(qEnd) : new Date("2026-04-30T23:59:59Z");

    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    // Clamp today to end of challenge if it's past it
    const challengeEnd = new Date("2026-04-30T23:59:59Z");
    const today = now > challengeEnd ? challengeEnd : now;

    if (timeframe === "week") {
      const day = today.getDay() || 7; // Sunday = 7
      const weekStart = new Date(today);
      weekStart.setHours(0, 0, 0, 0);
      weekStart.setDate(today.getDate() - day + 1);
      
      const challengeStart = new Date("2026-04-01T00:00:00Z");
      startDate = weekStart < challengeStart ? challengeStart : weekStart;
      endDate = new Date(today);
      endDate.setHours(23, 59, 59, 999);
    } else if (timeframe === "month") {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      
      const challengeStart = new Date("2026-04-01T00:00:00Z");
      startDate = monthStart < challengeStart ? challengeStart : monthStart;
      endDate = new Date(today);
      endDate.setHours(23, 59, 59, 999);
    } else if (timeframe === "all") {
      startDate = new Date("2026-04-01T00:00:00Z");
      endDate = new Date("2026-04-30T23:59:59Z");
    }

    const matchQuery = { 
      isValid: true,
      startDate: { $gte: startDate, $lte: endDate }
    };


    const nowTime = new Date();
    const last24hTime = new Date(nowTime.getTime() - 24 * 60 * 60 * 1000);

    // F. Apply Pagination (Starting from USER to include 0km people)
    const leaderboard = await User.aggregate([
      {
        $lookup: {
          from: "activities",
          localField: "_id",
          foreignField: "userId",
          pipeline: [{ $match: matchQuery }],
          as: "validActivities"
        }
      },
      {
        $addFields: {
          totalDistance: { $sum: "$validActivities.distance" },
          totalMovingTime: { $sum: "$validActivities.movingTime" },
          activitiesCount: { $size: "$validActivities" },
          distanceLast24h: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: "$validActivities",
                    as: "act",
                    cond: { $gte: ["$$act.startDate", new Date(Date.now() - 24 * 60 * 60 * 1000)] }
                  }
                },
                as: "recent",
                in: "$$recent.distance"
              }
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          userId: "$_id",
          stravaId: 1,
          name: { $concat: [{ $ifNull: ["$firstName", ""] }, " ", { $ifNull: ["$lastName", ""] }] },
          avatar: "$profile",
          location: 1,
          teamName: 1,
          gender: 1,
          distance: { $divide: ["$totalDistance", 1000] },
          totalMovingTime: 1,
          activitiesCount: 1,
          trend: { $divide: ["$distanceLast24h", 1000] }
        }
      },
      { $sort: { distance: -1, name: 1 } },
      { $skip: skip },
      { $limit: limit }
    ]);

    // G. Total Count for pagination meta
    const total = await User.countDocuments({});

    // H. Add ranks and format details
    const rankedLeaderboard = leaderboard.map((item, index) => {
      let paceStr = "0:00";
      if (item.distance > 0 && item.totalMovingTime > 0) {
        const paceTotalSeconds = item.totalMovingTime / item.distance;
        const mins = Math.floor(paceTotalSeconds / 60);
        const secs = Math.floor(paceTotalSeconds % 60);
        paceStr = `${mins}:${secs.toString().padStart(2, '0')}`;
      }

      return {
        rank: skip + index + 1,
        ...item,
        name: (item.name || "").trim(),
        pace: paceStr,
        trend: parseFloat((item.trend || 0).toFixed(2))
      };
    });

    res.json({
      meta: {
        total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        limit
      },
      data: rankedLeaderboard
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
    const { startDate: qStart, endDate: qEnd, timeframe } = req.query;

    let startDate = qStart ? new Date(qStart) : new Date("2026-04-01T00:00:00Z");
    let endDate = qEnd ? new Date(qEnd) : new Date("2026-04-30T23:59:59Z");

    const now = new Date();
    const challengeEnd = new Date("2026-04-30T23:59:59Z");
    const today = now > challengeEnd ? challengeEnd : now;

    if (timeframe === "week") {
      const day = today.getDay() || 7; 
      const weekStart = new Date(today);
      weekStart.setHours(0, 0, 0, 0);
      weekStart.setDate(today.getDate() - day + 1);
      
      const challengeStart = new Date("2026-04-01T00:00:00Z");
      startDate = weekStart < challengeStart ? challengeStart : weekStart;
      endDate = new Date(today);
      endDate.setHours(23, 59, 59, 999);
    } else if (timeframe === "month") {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const challengeStart = new Date("2026-04-01T00:00:00Z");
      startDate = monthStart < challengeStart ? challengeStart : monthStart;
      endDate = new Date(today);
      endDate.setHours(23, 59, 59, 999);
    } else if (timeframe === "all") {
      startDate = new Date("2026-04-01T00:00:00Z");
      endDate = new Date("2026-04-30T23:59:59Z");
    }

    const matchQuery = { 
      isValid: true,
      startDate: { $gte: startDate, $lte: endDate }
    };


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
    
    // Validate MongoDB ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid User ID format" });
    }

    // 1. Get User Profile (Hide sensitive tokens)
    const user = await User.findById(id).select("-accessToken -refreshToken -tokenExpiresAt");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // 2. Get User Activities (Valid only)
    const activities = await Activity.find({ 
      userId: id,
      isValid: true 
    }).sort({ startDate: -1 });

    // 3. Calculate Summary Stats
    const totalDistanceMeters = activities.reduce((sum, act) => sum + act.distance, 0);
    const totalDistanceKm = totalDistanceMeters / 1000;

    res.json({
      athlete: user,
      stats: {
        activityCount: activities.length,
        totalDistanceKm: parseFloat(totalDistanceKm.toFixed(2)),
        totalDistanceMeters
      },
      activities: activities.map(act => ({
        id: act.stravaId,
        name: act.name,
        distanceKm: parseFloat((act.distance / 1000).toFixed(2)),
        movingTime: act.movingTime,
        pace: act.pace,
        date: act.startDate,
        location: act.location,
        type: act.type
      }))
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
