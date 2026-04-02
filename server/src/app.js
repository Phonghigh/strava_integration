// src/app.js
// Express application entry point

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import stravaRoutes from "./routes/strava.routes.js";
import leaderboardRoutes from "./routes/leaderboard.routes.js";
import { connectDB } from "./db/connect.js";

dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || "*",
  methods: ["GET", "POST"],
}));
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/strava", stravaRoutes);
app.use("/api/leaderboard", leaderboardRoutes);

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Strava API server running 🚀" });
});

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("[unhandled error]", err);
  res.status(500).json({ error: "Internal server error" });
});

// ─── Start server (local dev only) ────────────────────────────────────────────
// Vercel runs this file as a serverless function using the exported `app`.
// app.listen() is skipped on Vercel — only runs locally with `npm run dev`.
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
  });
}

// ─── Export for Vercel ────────────────────────────────────────────────────────
export default app;
