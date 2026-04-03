import express from "express";
import { 
  getIndividualsLeaderboard, 
  getTeamLeaderboard,
  getAthleteDetail
} from "../controllers/leaderboard.controller.js";

const router = express.Router();

router.get("/individuals", getIndividualsLeaderboard);
router.get("/teams", getTeamLeaderboard);
router.get("/athlete/:id", getAthleteDetail);

export default router;
