// src/app.js
// Express application entry point

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import stravaRoutes from "./routes/strava.routes.js";
import { connectDB } from "./db/connect.js";

dotenv.config();

// Connect to MongoDB
await connectDB();

const app = express();

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: true, // Allow all origins dynamic
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  credentials: true,
}));
app.use(express.json());

// Thêm logger chi tiết để theo dõi các endpoint
app.use((req, res, next) => {
  console.log(`\n[${new Date().toISOString()}] ➡️ ${req.method} ${req.url}`);
  if (Object.keys(req.query).length > 0) {
    console.log(`   🔍 Query:`, req.query);
  }
  if (Object.keys(req.body).length > 0) {
    console.log(`   📦 Body:`, req.body);
  }
  next();
});

import apiV1 from "./routes/index.js";

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/v1", apiV1);

// Legacy strava oauth (optional fallback or cleanup later)
app.use("/api/strava", stravaRoutes);

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
