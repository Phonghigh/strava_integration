// src/middlewares/auth.middleware.js
import jwt from "jsonwebtoken";
import { User } from "../models/User.model.js";

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid authorization header" });
    }

    const token = authHeader.split(" ")[1];
    
    // Default fallback for development if JWT_SECRET is not in .env yet
    const secret = process.env.JWT_SECRET || "vietseeds_secret_placeholder";

    const decoded = jwt.verify(token, secret);
    
    // Find the user to ensure they still exist in the database
    const user = await User.findById(decoded.id).select("-accessToken -refreshToken");
    if (!user) {
      return res.status(401).json({ error: "User no longer exists" });
    }

    req.user = user; // attach user to the request
    next();
  } catch (error) {
    console.error("[Auth Middleware]", error.message);
    return res.status(401).json({ error: "Unauthorized / Invalid Token" });
  }
};
