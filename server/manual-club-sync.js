// manual-club-sync.js
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { syncClubData } from './src/services/sync.service.js';

dotenv.config();

async function run() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("SUCCESS: Connected to MongoDB");

    const args = process.argv.slice(2);
    const phaseArg = args.find(a => a.startsWith('--phase=') || a.startsWith('-p='));
    const fullSync = args.includes('--full');
    
    let options = { runPhase1: true, runPhase2: true, fullSync: fullSync };

    if (phaseArg) {
      const val = phaseArg.split('=')[1];
      if (val === '1') options = { runPhase1: true, runPhase2: false, fullSync };
      if (val === '2') options = { runPhase1: false, runPhase2: true, fullSync };
    }

    console.log("--------------------------------------------------");
    console.log(`Starting Club Sync - Phase ${phaseArg ? phaseArg.split('=')[1] : "Full"} (Mode: ${fullSync ? "FULL" : "Incremental"})...`);
    console.log("--------------------------------------------------");
    
    const startTime = Date.now();
    const result = await syncClubData(options);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log("--------------------------------------------------");
    console.log("SYNC COMPLETED SUCCESSFULLY in " + duration + "s");
    console.log("Members Reconciled: " + result.membersCount);
    console.log("Club Feed Items Catch: " + result.clubFeedSynced);
    console.log("--------------------------------------------------");

    console.log("Closing DB connection...");
    await Promise.race([
      mongoose.disconnect(),
      new Promise(resolve => setTimeout(resolve, 2000))
    ]);
    process.exit(0);
  } catch (err) {
    console.error("CRITICAL ERROR during sync:", err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

run();
