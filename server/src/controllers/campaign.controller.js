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
