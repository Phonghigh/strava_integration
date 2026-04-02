// src/controllers/campaign.controller.js
import { Activity } from "../models/Activity.model.js";
import { User } from "../models/User.model.js";

/**
 * GET /api/v1/campaign/stats
 */
export const getCampaignStats = async (req, res) => {
  try {
    const totalResult = await Activity.aggregate([
      { $match: { isValid: true } },
      { $group: { _id: null, totalKm: { $sum: "$distance" }, activitiesCount: { $sum: 1 } } }
    ]);
    const currentKm = (totalResult[0]?.totalKm || 0) / 1000;
    const totalActivities = totalResult[0]?.activitiesCount || 0;

    const totalRunners = await User.countDocuments();

    res.json({
      targetKm: 10000, // Campaign hardcoded target, could be stored in DB later
      currentKm,
      totalRunners,
      totalActivities
    });
  } catch (error) {
    console.error("[Campaign Stats Error]", error.message);
    res.status(500).json({ error: "Failed to fetch campaign stats" });
  }
};
