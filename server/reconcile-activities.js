// reconcile-activities.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from './src/models/User.model.js';
import { Activity } from './src/models/Activity.model.js';

dotenv.config();

async function reconcile() {
  console.log("Connecting to MongoDB for Cleanup...");
  await mongoose.connect(process.env.MONGODB_URI);

  // 1. Delete activities BEFORE April 1st, 2026 using NATIVE MongoDB Driver
  const TARGET_DATE = new Date('2026-04-01T00:00:00Z');
  
  // Use native driver for guaranteed deletion
  const nativeColl = mongoose.connection.db.collection('activities');
  const dateRes = await nativeColl.deleteMany({ startDate: { $lt: TARGET_DATE } });
  console.log(`[Cleanup] CONFIRMED: Deleted ${dateRes.deletedCount} activities before April 1st.`);

  // 2. Delete activities with 0 distance
  const zeroRes = await nativeColl.deleteMany({ distance: 0 });
  console.log(`[Cleanup] Deleted ${zeroRes.deletedCount} activities with 0 distance.`);

  // 3. Cleanup userId: null
  const orphans = await Activity.find({ userId: null });
  console.log(`[Audit] Matching ${orphans.length} orphaned activities...`);

  let matched = 0;
  for (const act of orphans) {
    if (act.athleteName) {
      const nameParts = act.athleteName.trim().split(' ');
      const user = await User.findOne({ firstName: new RegExp(`^${nameParts[0]}$`, 'i') });
      if (user) {
        act.userId = user._id;
        await act.save();
        matched++;
      } else {
        await Activity.deleteOne({ _id: act._id });
      }
    } else {
      await Activity.deleteOne({ _id: act._id });
    }
  }

  // Final check for dates
  const finalCheck = await Activity.countDocuments({ startDate: { $lt: TARGET_DATE } });
  console.log(`[Final Audit] Remaining activities before April 1st: ${finalCheck}`);

  await mongoose.connection.close();
}

reconcile();
