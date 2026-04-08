// src/middlewares/auth.middleware.js
import jwt from "jsonwebtoken";
import { User } from "../models/User.model.js";

export const requireAuth = async (req, res, next) => {
  try {
    let token;
    
    // Check Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } 
    // Fallback: check request body for "token" field
    else if (req.body && req.body.token) {
      token = req.body.token;
    }

    if (!token) {
      return res.status(401).json({ error: "Missing authorization token in header or body" });
    }
    
    // Default fallback for development if JWT_SECRET is not in .env yet
    const secret = process.env.JWT_SECRET || "vietseeds_secret_placeholder";

    // ✅ SPECIAL CASE FOR EXTERNAL SYNC (n8n): If token matches the secret string exactly
    if (token === secret) {
       // Authenticated as system (No user attached, suitable for global sync)
       return next();
    }

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

/**
 * Populates req.user if a valid token is present, but doesn't block if missing or invalid.
 */
export const optionalAuth = async (req, res, next) => {
  try {
    let token;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.body && req.body.token) {
      token = req.body.token;
    }

    if (!token) return next();

    const secret = process.env.JWT_SECRET || "vietseeds_secret_placeholder";
    
    // System token bypass
    if (token === secret) return next();

    const decoded = jwt.verify(token, secret);
    const user = await User.findById(decoded.id);
    if (user) {
      req.user = user;
    }
    next();
  } catch (error) {
    // Silently fail for optional auth
    next();
  }
};

