// src/routes/campaign.routes.js
import express from "express";
import { 
  getCampaignStats, 
  getCampaignTrend, 
  getCampaignHeatmap 
} from "../controllers/campaign.controller.js";

const router = express.Router();

router.get("/stats", getCampaignStats);
router.get("/trend", getCampaignTrend);
router.get("/heatmap", getCampaignHeatmap);

export default router;
