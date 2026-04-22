import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Activity } from './src/models/Activity.model.js';

dotenv.config();

/**
 * Helper to parse "M:SS" string to total seconds.
 */
const parsePaceToSeconds = (paceStr) => {
  if (!paceStr || paceStr === "-" || typeof paceStr !== 'string') return null;
  const parts = paceStr.split(':').map(v => parseInt(v));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return (parts[0] * 60) + parts[1];
  }
  return null;
};

/**
 * Core validation logic: Running + dist >= 1km + Pace 4:00-15:00
 */
const checkIsValid = (act) => {
  // 1. Must be a Run
  const isRun = ['Run', 'VirtualRun'].includes(act.type);
  if (!isRun) return { valid: false, reason: 'Not a Run' };

  // 2. Must be >= 1km (1000m)
  const isLongEnough = act.distance && act.distance >= 1000;
  if (!isLongEnough) return { valid: false, reason: 'Distance < 1km' };

  // 3. Pace must be within 4:00 - 15:00
  let paceSeconds = parsePaceToSeconds(act.pace);
  
  // Fallback to calculation from raw fields if pace string is missing
  if (!paceSeconds && act.distance > 0 && act.movingTime > 0) {
    paceSeconds = act.movingTime / (act.distance / 1000);
  }

  if (!paceSeconds) return { valid: false, reason: 'No Pace data' };
  
  const isPaceOk = paceSeconds >= 240 && paceSeconds <= 900;
  if (!isPaceOk) {
      const m = Math.floor(paceSeconds/60);
      const s = Math.round(paceSeconds%60);
      return { valid: false, reason: `Pace out of range (${m}:${s.toString().padStart(2, '0')})` };
  }

  return { valid: true };
};

async function run() {
  try {
    if (!process.env.MONGODB_URI) {
        console.error("ERROR: MONGODB_URI not found in .env");
        process.exit(1);
    }

    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("SUCCESS: Connected.");
    
    // Target activities from April 2026 onwards
    const query = { startDate: { $gte: new Date('2026-04-01') } };
    const activities = await Activity.find(query);
    console.log(`Found ${activities.length} activities to verify for month 2026-04.`);

    let validCount = 0;
    let invalidCount = 0;
    let changedCount = 0;
    const bulkOps = [];

    const statsByType = {};

    for (const act of activities) {
      const result = checkIsValid(act);
      const shouldBeValid = result.valid;

      // Track stats for reporting
      statsByType[act.type] = (statsByType[act.type] || 0) + 1;

      if (act.isValid !== shouldBeValid) {
        changedCount++;
        bulkOps.push({
          updateOne: {
            filter: { _id: act._id },
            update: { $set: { isValid: shouldBeValid } }
          }
        });
      }

      if (shouldBeValid) validCount++;
      else invalidCount++;
    }

    if (bulkOps.length > 0) {
      console.log(`Updating ${bulkOps.length} activities with mismatched validity status...`);
      await Activity.bulkWrite(bulkOps);
    } else {
      console.log("No changes needed. All activities already match the validation rules.");
    }

    console.log("\n------------------------------------------");
    console.log(`VERIFICATION SUMMARY (Month: 202604)`);
    console.log(`Total Scanned    : ${activities.length}`);
    console.log(`Valid Activities : ${validCount}`);
    console.log(`Invalid Activities: ${invalidCount}`);
    console.log(`Status Updates   : ${changedCount}`);
    console.log("------------------------------------------");
    console.log("Stats by Type:");
    Object.entries(statsByType).forEach(([type, count]) => {
        console.log(` - ${type}: ${count}`);
    });
    console.log("------------------------------------------");

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("CRITICAL ERROR:", err);
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    process.exit(1);
  }
}

run();
