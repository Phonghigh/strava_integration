import { Activity } from "../models/Activity.model.js";
import { User } from "../models/User.model.js";
import mongoose from "mongoose";

/**
 * GET /api/v1/teams/:teamId
 * @param {string} teamId - This maps to the teamName field in User model
 */
export const getTeamDetail = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { startDate: qStart, endDate: qEnd, timeframe } = req.query;

    // 1. Setup Date Range (Consistent with Leaderboard)
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

    // 2. Step 1: Get Global Team Ranks to find this team's rank
    const teamsLeaderboard = await User.aggregate([
      { 
        $match: { 
          teamName: { $ne: "No Team", $exists: true, $nin: ["", null] } 
        } 
      },
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
      { $sort: { totalDistance: -1 } }
    ]);

    const teamIndex = teamsLeaderboard.findIndex(t => t._id === teamId);
    if (teamIndex === -1) {
      // Check if team exists at all but just has 0km
      const teamExists = await User.exists({ teamName: teamId });
      if (!teamExists) {
        return res.status(404).json({ error: "Team not found" });
      }
    }

    const teamStats = teamsLeaderboard[teamIndex] || {
      _id: teamId,
      totalDistance: 0,
      memberCount: await User.countDocuments({ teamName: teamId })
    };

    // 3. Step 2: Get Detailed Member rankings for THIS team
    const membersData = await User.aggregate([
      { $match: { teamName: teamId } },
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
          totalDistance: { $sum: "$userActivities.distance" },
          activitiesCount: { $size: "$userActivities" }
        }
      },
      {
        $project: {
          _id: 0,
          userId: "$_id",
          name: { $trim: { input: { $concat: [{ $ifNull: ["$firstName", ""] }, " ", { $ifNull: ["$lastName", ""] }] } } },
          avatar: "$profile",
          distance: { $divide: ["$totalDistance", 1000] },
          activitiesCount: 1
        }
      },
      { $sort: { distance: -1, name: 1 } }
    ]);

    const rankedMembers = membersData.map((m, idx) => ({
      ...m,
      distance: parseFloat((m.distance || 0).toFixed(2)),
      rankInTeam: idx + 1
    }));

    // 4. Final Response
    res.json({
      team: {
        id: teamId,
        name: teamId,
        avatar: "🛡️", // Default team icon
        totalDistance: parseFloat((teamStats.totalDistance / 1000).toFixed(2)),
        memberCount: teamStats.memberCount,
        rank: teamIndex === -1 ? teamsLeaderboard.length + 1 : teamIndex + 1
      },
      members: rankedMembers
    });

  } catch (err) {
    console.error("[getTeamDetail] Error:", err);
    res.status(500).json({ error: "Failed to fetch team details" });
  }
};
