// src/routes/activities.routes.js
import express from "express";
import { getMyActivities, syncActivities } from "../controllers/activities.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/me", requireAuth, getMyActivities);
router.post("/sync", requireAuth, syncActivities);

export default router;
