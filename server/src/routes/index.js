// src/routes/index.js
import express from "express";
import authRoutes from "./auth.routes.js";
import campaignRoutes from "./campaign.routes.js";
import activitiesRoutes from "./activities.routes.js";
import leaderboardRoutes from "./leaderboard.routes.js";
import teamsRoutes from "./teams.routes.js";
import webhooksRoutes from "./webhooks.routes.js";

const apiV1 = express.Router();

apiV1.use("/auth", authRoutes);
apiV1.use("/campaign", campaignRoutes);
apiV1.use("/activities", activitiesRoutes);
apiV1.use("/leaderboard", leaderboardRoutes);
apiV1.use("/teams", teamsRoutes);
apiV1.use("/webhooks", webhooksRoutes);
apiV1.use("/certificates", (req, res) => res.json({ isEligible: true, target: "To be implemented" }));

export default apiV1;
