// src/routes/auth.routes.js
import express from "express";
import { exchangeStravaCode, getMe } from "../controllers/auth.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/strava/exchange", exchangeStravaCode);
router.get("/me", requireAuth, getMe);

export default router;
