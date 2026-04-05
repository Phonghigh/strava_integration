// src/controllers/campaign.controller.js
import { Activity } from "../models/Activity.model.js";
import { User } from "../models/User.model.js";

import { connectDB } from "../db/connect.js";
import { normalizeProvince } from "../utils/provinceUtils.js";

/**
 * GET /api/v1/campaign/stats
 * Query Params: startDate, endDate
 */
export const getCampaignStats = async (req, res) => {
  try {
    // 1. Ensure DB is connected (Serverless singleton)
    await connectDB();

    const { startDate, endDate } = req.query;

    const matchStage = { isValid: true };
    
    // 2. Add date filtering if provided
    if (startDate || endDate) {
      matchStage.startDate = {};
      if (startDate) matchStage.startDate.$gte = new Date(startDate);
      if (endDate) matchStage.startDate.$lte = new Date(endDate);
    }

    const totalResult = await Activity.aggregate([
      { $match: matchStage },
      { 
        $group: { 
          _id: null, 
          totalKm: { $sum: "$distance" }, 
          activitiesCount: { $sum: 1 } 
        } 
      }
    ]);

    const currentKm = (totalResult[0]?.totalKm || 0) / 1000;
    const totalActivities = totalResult[0]?.activitiesCount || 0;

    // 3. For Runners, we count all unique users for now
    const totalRunners = await User.countDocuments();

    res.json({
      targetKm: 10000, 
      currentKm: Math.round(currentKm * 100) / 100, // Round to 2 decimals
      totalRunners,
      totalActivities,
      filters: { startDate, endDate }
    });
  } catch (error) {
    console.error("[Campaign Stats Error]:", error);
    res.status(500).json({ 
      error: "Failed to fetch campaign stats",
      message: error.message 
    });
  }
};

/**
 * GET /api/v1/campaign/trend
 * Returns list of daily distance from start of campaign to present.
 */
export const getCampaignTrend = async (req, res) => {
  try {
    await connectDB();

    const campaignStart = new Date("2026-04-01T00:00:00Z");
    const today = new Date();

    const trendData = await Activity.aggregate([
      {
        $match: {
          isValid: true,
          startDate: { $gte: campaignStart, $lte: today }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$startDate", timezone: "+07:00" } },
          totalDistance: { $sum: "$distance" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Create a map for easy lookup
    const dashboardData = new Map(trendData.map(d => [d._id, d.totalDistance]));

    // Fill missing days from start to today
    const finalTrend = [];
    let current = new Date(campaignStart);
    while (current <= today) {
      const dateStr = current.toISOString().split('T')[0];
      const totalDist = dashboardData.get(dateStr) || 0;
      
      const day = String(current.getDate()).padStart(2, '0');
      const month = String(current.getMonth() + 1).padStart(2, '0');

      finalTrend.push({
        date: `${day}/${month}`,
        km: parseFloat((totalDist / 1000).toFixed(1))
      });
      
      current.setDate(current.getDate() + 1);
    }

    res.json(finalTrend);
  } catch (error) {
    console.error("[Campaign Trend Error]:", error);
    res.status(500).json({ 
      error: "Failed to fetch campaign trend",
      message: error.message 
    });
  }
};

/**
 * GET /api/v1/campaign/heatmap
 * Returns list of members and activities by city/province.
 * Query Params:
 * - groupBy: "user" (registered city) or "activity" (strava location, default)
 * - sortBy: "activities" (default) or "members"
 */
export const getCampaignHeatmap = async (req, res) => {
  try {
    await connectDB();

    const { groupBy = 'activity', sortBy = 'activities' } = req.query;
    let heatmapData = [];

    if (groupBy === 'user') {
      // MODE 1: Group by User's registered location
      heatmapData = await User.aggregate([
        { 
          $match: { 
            $or: [
              { city: { $exists: true, $ne: "" } },
              { location: { $exists: true, $ne: "" } }
            ] 
          } 
        },
        {
          $lookup: {
            from: "activities",
            localField: "_id",
            foreignField: "userId",
            pipeline: [{ $match: { isValid: true } }],
            as: "validActivities"
          }
        },
        {
          $project: {
            province: { 
              $ifNull: [
                { $cond: [{ $eq: ["$city", ""] }, null, "$city"] }, 
                "$location"
              ] 
            },
            numActivities: { $size: "$validActivities" },
            totalKm: { $sum: "$validActivities.distance" }
          }
        },
        {
          $group: {
            _id: { $toUpper: { $trim: { input: "$province" } } },
            members: { $sum: 1 },
            activityCount: { $sum: "$numActivities" },
            totalDistance: { $sum: "$totalKm" }
          }
        },
        {
          $project: {
            _id: 0,
            province: "$_id",
            members: 1,
            activities: { $round: [{ $divide: ["$totalDistance", 1000] }, 1] },
            rawActivityCount: "$activityCount"
          }
        }
      ]);
    } else {
      // MODE 2: Group by Activity's recorded location (Default)
      heatmapData = await Activity.aggregate([
        { $match: { isValid: true, location: { $exists: true, $ne: "" } } },
        {
          $group: {
            _id: { $toUpper: { $trim: { input: "$location" } } },
            members: { $addToSet: "$userId" },
            totalDistance: { $sum: "$distance" },
            activityCount: { $sum: 1 }
          }
        },
        {
          $project: {
            _id: 0,
            province: "$_id",
            members: { $size: "$members" },
            activities: { $round: [{ $divide: ["$totalDistance", 1000] }, 1] },
            rawActivityCount: "$activityCount"
          }
        }
      ]);
    }

    // 6. Post-processing for normalization and merging
    const normalizedMap = heatmapData.reduce((acc, item) => {
      const p = normalizeProvince(item.province);
      
      // Skip if normalization returned null (International or junk data)
      if (!p) return acc;
      
      if (!acc[p]) {
        acc[p] = { province: p, members: 0, activities: 0, rawActivityCount: 0 };
      }
      
      acc[p].members += item.members;
      acc[p].activities += item.activities;
      acc[p].rawActivityCount += item.rawActivityCount;
      
      return acc;
    }, {});

    let cleanedData = Object.values(normalizedMap).map(item => ({
      ...item,
      activities: Math.round(item.activities * 10) / 10 // Re-round after sum
    }));

    // 7. Sort based on parameter (before object conversion)
    if (sortBy === 'members') {
      cleanedData.sort((a, b) => b.members - a.members || b.activities - a.activities);
    } else {
      cleanedData.sort((a, b) => b.activities - a.activities || b.members - a.members);
    }

    // 8. Transform to requested format: { members: { Province: Value }, activities: { Province: Value } }
    const finalResult = {
      members: {},
      activities: {}
    };

    cleanedData.forEach(item => {
      finalResult.members[item.province] = item.members;
      finalResult.activities[item.province] = item.activities;
    });

    res.json(finalResult);
  } catch (error) {
    console.error("[Campaign Heatmap Error]:", error);
    res.status(500).json({ 
      error: "Failed to fetch heatmap data",
      message: error.message 
    });
  }
};
