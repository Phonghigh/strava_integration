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

/**
 * GET /api/v1/activities/recent
 * Returns global live feed of latest activities.
 */
export const getRecentActivities = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;

    const activities = await Activity.aggregate([
      // 1. Filter valid only
      { $match: { isValid: true } },
      
      // 2. Latest first
      { $sort: { startDate: -1 } },
      
      // 3. Limit
      { $limit: limit },
      
      // 4. Lookup user details
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userDetails"
        }
      },
      
      // 5. Project final format with fallbacks
      {
        $project: {
          _id: 0,
          id: "$stravaId",
          userName: {
            $let: {
              vars: { user: { $arrayElemAt: ["$userDetails", 0] } },
              in: {
                $ifNull: [
                  { 
                    $trim: { 
                      input: { $concat: [{ $ifNull: ["$$user.firstName", ""] }, " ", { $ifNull: ["$$user.lastName", ""] }] } 
                    } 
                  },
                  "$athleteName"
                ]
              }
            }
          },
          userAvatar: { $ifNull: [{ $arrayElemAt: ["$userDetails.profile", 0] }, ""] },
          userId: { $ifNull: [{ $arrayElemAt: ["$userDetails._id", 0] }, null] },
          distance: { $round: [{ $divide: ["$distance", 1000] }, 1] },
          location: { $ifNull: ["$location", ""] },
          createdAt: "$startDate"
        }
      }
    ]);

    res.json(activities);
  } catch (error) {
    console.error("[Get Recent Activities Error]", error.message);
    res.status(500).json({ error: "Failed to fetch recent activities" });
  }
};
