// src/services/sync.service.js
import { User } from "../models/User.model.js";
import { Activity } from "../models/Activity.model.js";
import { getActivitiesForUser } from "./strava.service.js";

/**
 * Loops through all users in the DB, fetches their recent Strava activities,
 * and saves them to the global Activity collection.
 */
export const syncAllUsersActivities = async () => {
  const users = await User.find({});
  let totalSynced = 0;

  for (const user of users) {
    try {
      // 1. Fetch from Strava (automatically refreshes token if needed)
      const activities = await getActivitiesForUser(user);

      // 2. Save each activity to DB
      for (const act of activities) {
        await Activity.findOneAndUpdate(
          { stravaId: act.id.toString() },
          {
            userId: user._id,
            name: act.name,
            distance: act.distance,
            movingTime: act.moving_time,
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
