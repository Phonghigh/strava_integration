import mongoose from 'mongoose';
import { Activity } from './src/models/Activity.model.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Cleanup script to recalculate 'isValid' for all existing activities 
 * based on the new rules:
 * 1. Type: Run
 * 2. Distance: >= 1000m
 * 3. Pace: 4:00 - 15:00 min/km
 */
async function fixValidation() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('SUCCESS: Connected to MongoDB');

        const activities = await Activity.find({});
        console.log(`Found ${activities.length} activities to evaluate...`);

        let updatedCount = 0;
        let validCount = 0;
        let invalidCount = 0;

        for (const act of activities) {
            // 1. Type check
            const isTypeValid = act.type === 'Run';
            
            // 2. Distance check
            const isDistanceValid = act.distance >= 1000;
            
            // 3. Pace check
            let isPaceValid = false;
            if (act.pace && act.pace !== "-") {
                const parts = act.pace.split(':');
                if (parts.length === 2) {
                    const min = parseInt(parts[0]) || 0;
                    const sec = parseInt(parts[1]) || 0;
                    const totalSeconds = (min * 60) + sec;
                    // 4:00 = 240s, 15:00 = 900s
                    isPaceValid = totalSeconds >= 240 && totalSeconds <= 900;
                }
            }

            const isNowValid = isTypeValid && isDistanceValid && isPaceValid;

            // Only update if current state is different
            if (act.isValid !== isNowValid) {
                act.isValid = isNowValid;
                await act.save();
                updatedCount++;
            }

            if (isNowValid) validCount++;
            else invalidCount++;
        }

        console.log('--------------------------------------------------');
        console.log('CLEANUP COMPLETED:');
        console.log(`- Total Processed: ${activities.length}`);
        console.log(`- Records Updated (Changed): ${updatedCount}`);
        console.log(`- Total Valid now: ${validCount}`);
        console.log(`- Total Invalid now: ${invalidCount}`);
        console.log('--------------------------------------------------');

        process.exit(0);
    } catch (error) {
        console.error('ERROR during validation fix:', error);
        process.exit(1);
    }
}

fixValidation();
