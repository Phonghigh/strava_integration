// src/routes/activities.routes.js
import express from "express";
import { 
  getMyActivities, 
  syncActivities, 
  getRecentActivities 
} from "../controllers/activities.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/me", requireAuth, getMyActivities);
router.post("/sync", requireAuth, syncActivities);
router.get("/recent", getRecentActivities);

export default router;
