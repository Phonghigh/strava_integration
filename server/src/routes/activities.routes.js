// src/routes/activities.routes.js
import express from "express";
import { 
  getMyActivities, 
  syncActivities, 
  getRecentActivities,
  getActivityDetail
} from "../controllers/activities.controller.js";
import { requireAuth, optionalAuth } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/me", requireAuth, getMyActivities);
router.post("/sync", requireAuth, syncActivities);
router.get("/recent", getRecentActivities);
router.get("/:id", optionalAuth, getActivityDetail);



export default router;
