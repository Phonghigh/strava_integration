import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from './src/db/connect.js';
import { syncClubData } from './src/services/sync.service.js';

dotenv.config();

async function run() {
  try {
    await connectDB();

    const args = process.argv.slice(2);
    const phaseArg = args.find(a => a.startsWith('--phase=') || a.startsWith('-p='));
    const limitArg = args.find(a => a.startsWith('--limit=') || a.startsWith('-l='));
    const athleteArg = args.find(a => a.startsWith('--athlete=') || a.startsWith('--athleteId='));
    const monthArg = args.find(a => a.startsWith('--month='));
    const weekArg = args.find(a => a.startsWith('--week='));
    const concurrencyArg = args.find(a => a.startsWith('--concurrency='));
    const fullSync = args.includes('--full');
    
    if (args.includes('--detail')) {
      console.warn("\n[Notice] The --detail flag in manual-club-sync.js is deprecated.");
      console.warn("Please use 'node src/scripts/local-detail-scraper.js --all' for detailed scraping.\n");
    }

    let options = { 
        runPhase1: true, 
        runPhase2: false, 
        runPhase3: true, 
        fullSync, 
        limit: 0, 
        concurrency: 3 
    };

    if (concurrencyArg) {
      options.concurrency = parseInt(concurrencyArg.split('=')[1]) || 3;
    }

    if (limitArg) {
      options.limit = parseInt(limitArg.split('=')[1]) || 0;
    }

    if (phaseArg) {
      const val = phaseArg.split('=')[1];
      if (val === '1') {
        options.runPhase1 = true;
        options.runPhase2 = false;
        options.runPhase3 = false;
      } else if (val === '2') {
        console.warn("[Manual] Phase 2 is deprecated and has been removed. Please use Phase 3 for activity sync.");
        options.runPhase1 = false;
        options.runPhase2 = false;
        options.runPhase3 = false;
      } else if (val === '3') {
        options.runPhase1 = false;
        options.runPhase2 = false;
        options.runPhase3 = true;
      }
    }

    if (athleteArg) {
      options.specificAthleteId = athleteArg.split('=')[1];
      options.runPhase1 = false;
      options.runPhase2 = false;
      options.runPhase3 = true;
      console.log(`[Manual] Target Athlete ID detected: ${options.specificAthleteId}. Forcing Phase 3...`);
    }

    if (monthArg) {
      options.targetMonth = monthArg.split('=')[1];
      console.log(`[Manual] Target Month detected: ${options.targetMonth}`);
    }

    if (weekArg) {
      options.targetWeek = weekArg.split('=')[1];
      console.log(`[Manual] Target Week detected: ${options.targetWeek}`);
    }

    console.log("--------------------------------------------------");
    console.log(`Starting Club Sync - Phase ${phaseArg ? phaseArg.split('=')[1] : "Full"} (Mode: ${fullSync ? "FULL" : "Incremental"})...`);
    console.log(`Concurrency: ${options.concurrency} workers`);
    console.log("--------------------------------------------------");
    
    const startTime = Date.now();
    const result = await syncClubData(options);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log("--------------------------------------------------");
    console.log("SYNC COMPLETED SUCCESSFULLY in " + duration + "s");
    console.log("Members Reconciled  : " + result.membersCount);
    console.log("Activities Checked  : " + result.clubFeedSynced);
    console.log("Existing Activities : " + (result.totalExistingCount || 0));
    console.log("NEW ACTIVITIES FOUND: " + (result.newActivityIds?.length || 0));
    
    if (result.newActivityIds && result.newActivityIds.length > 0) {
      console.log("Discovery IDs       : " + result.newActivityIds.join(', '));
    }
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
