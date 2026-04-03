// src/services/sync.service.js
import { User } from "../models/User.model.js";
import { Activity } from "../models/Activity.model.js";
import { getActivitiesForUser } from "./strava.service.js";
import { scrapeClubMembers, scrapeClubActivities } from "./scraper.service.js";

/**
 * Loops through all users in the DB, fetches their recent Strava activities,
 * and saves them to the global Activity collection.
 */
export const syncAllUsersActivities = async () => {
  const users = await User.find({});
  let totalSynced = 0;

  for (const user of users) {
    if (!user.accessToken || user.accessToken === '') {
      // Bỏ qua những thành viên được scraper tìm thấy nhưng chưa connect OAuth (không có token)
      continue;
    }

    try {
      // 1. Fetch from Strava (automatically refreshes token if needed)
      const activities = await getActivitiesForUser(user);

      // 2. Save each activity to DB
      for (const act of activities) {
        let isValid = true;
        let paceStr = "0:00";
        const distanceKm = act.distance / 1000;

        if (distanceKm > 0) {
          const paceTotalSeconds = act.moving_time / distanceKm;
          const paceMinutes = paceTotalSeconds / 60;
          
          const mins = Math.floor(paceTotalSeconds / 60);
          const secs = Math.floor(paceTotalSeconds % 60);
          paceStr = `${mins}:${secs.toString().padStart(2, '0')}`;
          
          // Requirement: pace from 4:00 to 15:00 / km is valid
          if (paceMinutes < 4 || paceMinutes > 15) {
            isValid = false;
          }
        } else {
          isValid = false;
        }

        // Only Run tracking is supported for the pace rules usually, but we will store validity.
        if (act.type !== "Run") {
           isValid = false;
        }

        await Activity.findOneAndUpdate(
          { stravaId: act.id.toString() },
          {
            userId: user._id,
            name: act.name,
            distance: act.distance, // stored in meters
            movingTime: act.moving_time,
            pace: paceStr,
            isValid,
            type: act.type,
            startDate: act.start_date,
          },
          { upsert: true }
        );
      }
      
      console.log(`Synced ${activities.length} activities for user: ${user.firstName}`);
      totalSynced += activities.length;
    } catch (err) {
      console.error(`Failed to sync for user ${user.stravaId} (${user.firstName}):`, err.message);
    }
  }

  return { usersCount: users.length, totalSynced };
};

/**
 * Higher level function to sync both OAuth users and discovered club members.
 * This is the ultimate "Dashboard Sync" job.
 */
export const syncClubData = async (options = { runPhase1: true, runPhase2: true }) => {
  const clubId = process.env.STRAVA_CLUB_ID;
  if (!clubId) throw new Error("STRAVA_CLUB_ID not set in .env");

  let membersCount = 0;
  let clubFeedSynced = 0;

  console.log(`[Sync] Starting club sync (Mode: ${JSON.stringify(options)}) for ID: ${clubId}`);

  // 1. Scrape member list (Authenticated via Cookies)
  if (options.runPhase1) {
    console.log(`[Sync] Phase 1: Reconciling club members list...`);
    const membersResult = await scrapeClubMembers(clubId);
    console.log(`[Sync] Successfully reconciled ${membersResult.totalScraped} members (over ${membersResult.pageCount} pages).`);
    membersCount = membersResult.totalScraped;
  }

  // 2. Scrape activities for the whole club (Unified Discovery)
  if (options.runPhase2) {
    console.log(`[Sync] Phase 2: Scraping recent club activity feed...`);
    const clubActs = await scrapeClubActivities(clubId, options.fullSync);
    clubFeedSynced = clubActs.length;
  }

  return {
    membersCount,
    clubFeedSynced: clubFeedSynced || 0
  };
};
