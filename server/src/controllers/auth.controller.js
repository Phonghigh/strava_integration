// src/controllers/auth.controller.js
import jwt from "jsonwebtoken";
import { exchangeTokenAndSaveUser } from "../services/strava.service.js";
import { Activity } from "../models/Activity.model.js";

// Generate our Application JWT
const generateToken = (userId) => {
  const secret = process.env.JWT_SECRET || "vietseeds_secret_placeholder";
  return jwt.sign({ id: userId }, secret, { expiresIn: "30d" });
};

/**
 * POST /api/v1/auth/strava/exchange
 * Body: { code: "xxx" }
 */
export const exchangeStravaCode = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: "Authorization code is required" });
    }

    // Call service to talk to Strava and save user
    const user = await exchangeTokenAndSaveUser(code);

    // Issue our own JWT
    const token = generateToken(user._id);

    return res.json({
      token,
      user: {
        id: user._id,
        stravaId: user.stravaId,
        name: `${user.firstName} ${user.lastName}`.trim(),
        avatar: user.profile,
        teamName: user.teamName
      }
    });

  } catch (error) {
    console.error("[Auth Controller] Exchange Error:", error.message);
    res.status(500).json({ error: "Failed to exchange authorization code" });
  }
};

/**
 * GET /api/v1/auth/me
 * Headers: Authorization: Bearer <token>
 */
export const getMe = async (req, res) => {
  try {
    // req.user is populated by the auth.middleware
    const user = req.user;

    // Aggregate user's activities to return their stats along with profile
    // Only count valid activities according to our V1 specs
    const statsResult = await Activity.aggregate([
      { $match: { userId: user._id, isValid: true } },
      { $group: { _id: null, totalDistance: { $sum: "$distance" }, totalMovingTime: { $sum: "$movingTime" } } }
    ]);

    const stats = statsResult[0] || { totalDistance: 0, totalMovingTime: 0 };

    res.json({
      id: user._id,
      stravaId: user.stravaId,
      name: `${user.firstName} ${user.lastName}`.trim(),
      avatar: user.profile,
      teamName: user.teamName,
      stats: {
        totalDistance: stats.totalDistance,
        totalMovingTime: stats.totalMovingTime
      }
    });

  } catch (error) {
    console.error("[Auth Controller] Me Error:", error.message);
    res.status(500).json({ error: "Failed to fetch user profile" });
  }
};
