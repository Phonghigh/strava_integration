// src/routes/campaign.routes.js
import express from "express";
import { getCampaignStats } from "../controllers/campaign.controller.js";

const router = express.Router();

router.get("/stats", getCampaignStats);

export default router;
