// src/routes/teams.routes.js
import express from "express";
import { getTeamDetail } from "../controllers/team.controller.js";

const router = express.Router();

// Placeholders for Team Management
router.get("/", (req, res) => res.json({ message: "List of all teams logic" }));
router.post("/:teamId/join", (req, res) => res.json({ message: `Joined team ${req.params.teamId}` }));
router.get("/:teamId", getTeamDetail);

export default router;

