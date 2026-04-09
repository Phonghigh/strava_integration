// src/controllers/activities.controller.js
import { Activity } from "../models/Activity.model.js";
import { User } from "../models/User.model.js";
import { syncAllUsersActivities } from "../services/sync.service.js";
import * as stravaService from "../services/strava.service.js";
import mongoose from "mongoose";


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

/**
 * GET /api/v1/activities/:id
 */
export const getActivityDetail = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Find Activity in DB
    let query = { stravaId: id };
    if (mongoose.Types.ObjectId.isValid(id)) {
      query = { $or: [{ _id: id }, { stravaId: id }] };
    }
    
    const activityRecord = await Activity.findOne(query);
    const stravaId = activityRecord?.stravaId || id;

    // 1.5 Quick Return if already scraped and in DB
    if (activityRecord?.polyline) {
      return res.json({
        activity: {
          id: activityRecord.stravaId,
          name: activityRecord.name,
          distance: activityRecord.distance,
          movingTime: activityRecord.movingTime,
          elapsedTime: activityRecord.elapsedTime || activityRecord.movingTime,
          totalElevationGain: activityRecord.totalElevationGain || 0,
          calories: activityRecord.calories || 0,
          type: activityRecord.type,
          startDate: activityRecord.startDate,
          deviceName: activityRecord.deviceName || "",
          description: activityRecord.description || "",
          athleteAvatar: activityRecord.athleteAvatar || "",
          map: {
            polyline: activityRecord.polyline
          }
        },
        streams: {
          time: activityRecord.streams?.time || [],
          distance: activityRecord.streams?.distance || [],
          latlng: activityRecord.streams?.latlng || [],
          altitude: activityRecord.streams?.altitude || [],
          velocity_smooth: activityRecord.streams?.velocitySmooth || [],
          heartrate: activityRecord.streams?.heartrate || [],
          cadence: activityRecord.streams?.cadence || [],
          grade_smooth: activityRecord.streams?.gradeSmooth || [],
        },
        laps: activityRecord.summaryLaps || []
      });
    }


    // 2. Select User for Strava Token

    let tokenUser = null;

    // Option A: Use activity owner if authorized
    if (activityRecord?.userId) {
      const owner = await User.findById(activityRecord.userId);
      if (owner?.isAuthorized) {
        tokenUser = owner;
      }
    }

    // Option B: Fallback to the requester (You) if logged in and authorized
    if (!tokenUser && req.user?.isAuthorized) {
      tokenUser = req.user;
    }

    if (!tokenUser) {
      return res.status(401).json({ 
        error: "Authorization required. Please connect your Strava account to view detailed activities." 
      });
    }

    // 3. Fetch all details from Strava in parallel
    // Refresh token once first to avoid race conditions in parallel calls
    await stravaService.refreshTokenIfNeeded(tokenUser);
    
    const [detailedActivity, streams, laps] = await Promise.all([
      stravaService.getDetailedActivity(tokenUser, stravaId),
      stravaService.getActivityStreams(tokenUser, stravaId),
      stravaService.getActivityLaps(tokenUser, stravaId)
    ]);



    // 4. Format and Return
    res.json({
      activity: {
        id: detailedActivity.id.toString(),
        name: detailedActivity.name,
        distance: detailedActivity.distance,
        movingTime: detailedActivity.moving_time,
        elapsedTime: detailedActivity.elapsed_time,
        totalElevationGain: detailedActivity.total_elevation_gain,
        type: detailedActivity.type,
        startDate: detailedActivity.start_date,
        map: {
          polyline: detailedActivity.map?.polyline || ""
        }
      },
      streams: {
        time: streams.time?.data || [],
        distance: streams.distance?.data || [],
        latlng: streams.latlng?.data || [],
        altitude: streams.altitude?.data || [],
        velocity_smooth: streams.velocity_smooth?.data || [],
        heartrate: streams.heartrate?.data || []
      },
      laps: laps.map((lap, idx) => ({
        id: lap.id,
        distance: lap.distance,
        movingTime: lap.moving_time,
        averageSpeed: lap.average_speed,
        split: idx + 1
      }))
    });

  } catch (error) {
    if (error.response?.status === 404) {
      return res.status(404).json({ error: "Activity not found on Strava" });
    }
    console.error("[Get Activity Detail Error]", error.message);
    res.status(500).json({ error: "Failed to fetch activity details" });
  }
};

