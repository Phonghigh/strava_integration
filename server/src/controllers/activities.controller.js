// src/controllers/activities.controller.js
import { Activity } from "../models/Activity.model.js";
import { syncAllUsersActivities } from "../services/sync.service.js";

/**
 * GET /api/v1/activities/me
 * Query Params: page, limit
 */
export const getMyActivities = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const userId = req.user._id;

    const activities = await Activity.find({ userId })
      .sort({ startDate: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Activity.countDocuments({ userId });

    const formattedData = activities.map(act => ({
      activityId: act.stravaId,
      name: act.name,
      distance: act.distance / 1000, // Convert to Km according to standard
      movingTime: act.movingTime,
      pace: act.pace,
      date: act.startDate,
      isValid: act.isValid
    }));

    res.json({
      data: formattedData,
      meta: {
        total,
        currentPage: page,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error("[Activities Me Error]", error.message);
    res.status(500).json({ error: "Failed to fetch activities" });
  }
};

/**
 * POST /api/v1/activities/sync
 * Manually trigger sync
 */
export const syncActivities = async (req, res) => {
  try {
    // Note: In a true prod environment, this should only sync the logged-in user to avoid a massive global spike.
    // However, our current service function syncs everyone. We will keep it for now.
    const result = await syncAllUsersActivities();
    res.json({ message: "Sync completed successfully", ...result });
  } catch (error) {
    console.error("[Sync Error]", error.message);
    res.status(500).json({ error: "Sync failed" });
  }
};
