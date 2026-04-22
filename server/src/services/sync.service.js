// src/services/sync.service.js
import { User } from "../models/User.model.js";
import { Activity } from "../models/Activity.model.js";
// import { getActivitiesForUser } from "./strava.service.js";
import { 
  scrapeClubMembers, 
  scrapeClubMembersActivities, 
  // processStravaEntries, 
  scrapeActivityDetail,
  setStravaCookies
} from "./scraper.service.js";
import puppeteer from 'puppeteer-extra';
// import StealthPlugin from 'puppeteer-extra-plugin-stealth';

/**
 * Higher level function to sync both OAuth users and discovered club members.
 */
export const syncClubData = async (options = { runPhase1: true, runPhase2: false, runPhase3: true }) => {
  const clubId = process.env.STRAVA_CLUB_ID;
  if (!clubId) throw new Error("STRAVA_CLUB_ID not set in .env");

  let membersCount = 0;
  let clubFeedSynced = 0;
  let allProcessedNewIds = [];
  let totalExistingCount = 0;
  
  console.log(`[Sync] Starting club sync (Mode: ${JSON.stringify(options)}) for ID: ${clubId}`);

  // 1. Scrape member list
  if (options.runPhase1) {
    console.log(`[Sync] Phase 1: Reconciling club members list...`);
    const membersResult = await scrapeClubMembers(clubId);
    console.log(`[Sync] Successfully reconciled ${membersResult.totalScraped} members.`);
    membersCount = membersResult.totalScraped;
  }


  // 3. PHASE 3: Member-Based Deep Sync
  if (options.runPhase3) {
    console.log(`[Sync] Phase 3: Starting Member-Based Deep Sync...`);
    const mode = options.fullSync ? 'full' : 'normal';
    const result3 = await scrapeClubMembersActivities(clubId, mode, options.limit, options.specificAthleteId, options.targetMonth, options.concurrency, options.targetWeek);
    clubFeedSynced += result3.totalCaptured;
    allProcessedNewIds.push(...result3.allNewIds);
    totalExistingCount += result3.totalExistingCount;
  }

  // 4. Phase 4 (Detailed Scraping) has been removed. 
  // Please use src/scripts/local-detail-scraper.js for activity details.

  return {
    membersCount,
    clubFeedSynced: clubFeedSynced || 0,
    newActivityIds: allProcessedNewIds,
    totalExistingCount
  };
};

/**
 * Legacy wrapper to maintain compatibility with controllers and manual scripts.
 * Calls syncClubData with default options.
 */
export const syncAllUsersActivities = async () => {
  const result = await syncClubData();
  return {
    ...result,
    usersCount: result.membersCount,
    totalSynced: result.clubFeedSynced
  };
};

