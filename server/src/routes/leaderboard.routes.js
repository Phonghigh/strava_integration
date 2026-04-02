import express from "express";
import { 
  getIndividualsLeaderboard, 
  getTeamLeaderboard 
} from "../controllers/leaderboard.controller.js";

const router = express.Router();

router.get("/individuals", getIndividualsLeaderboard);
router.get("/teams", getTeamLeaderboard);

export default router;
