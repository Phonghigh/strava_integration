// src/routes/webhooks.routes.js
import express from "express";

const router = express.Router();

// Strava Webhook Endpoint (Payload comes here)
router.post("/strava", (req, res) => {
  console.log("Strava Webhook hit:", req.body);
  res.status(200).send("EVENT_RECEIVED");
});

export default router;
