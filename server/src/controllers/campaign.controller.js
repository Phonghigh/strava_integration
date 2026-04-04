// src/controllers/campaign.controller.js
import { Activity } from "../models/Activity.model.js";
import { User } from "../models/User.model.js";

import { connectDB } from "../db/connect.js";

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
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          date: {
            $concat: [
              { $substr: ["$_id", 8, 2] }, // DD
              "/",
              { $substr: ["$_id", 5, 2] }  // MM
            ]
          },
          km: { $round: [{ $divide: ["$totalDistance", 1000] }, 1] }
        }
      }
    ]);

    // Fill missing days if needed (optional but good for charts)
    // For now, return what's in the DB to follow the response sample
    res.json(trendData);
  } catch (error) {
    console.error("[Campaign Trend Error]:", error);
    res.status(500).json({ 
      error: "Failed to fetch campaign trend",
      message: error.message 
    });
  }
};
