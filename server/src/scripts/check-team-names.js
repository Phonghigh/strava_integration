import { connectDB } from '../db/connect.js';
import { User } from '../models/User.model.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const checkTeamNames = async () => {
    try {
        await connectDB();

        // Regex for the new standard format: "Nhóm [Number] [HCM/HN/Huế]"
        const standardFormat = /^Nhóm \d+ (HCM|HN|Huế)$/;

        const users = await User.find({});

        const irregularTeams = new Set();
        const samples = {};
        let nullCount = 0;
        let standardCount = 0;
        const nullSamples = [];

        users.forEach(user => {
            if (!user.teamName || user.teamName === 'No Team') {
                nullCount++;
                if (nullSamples.length < 5) nullSamples.push(`${user.firstName} ${user.lastName} (${user.stravaId})`);
            } else if (standardFormat.test(user.teamName)) {
                standardCount++;
            } else {
                irregularTeams.add(user.teamName);
                if (!samples[user.teamName]) {
                    samples[user.teamName] = `${user.firstName} ${user.lastName} (${user.stravaId})`;
                }
            }
        });

        console.log('--- TEAM NAME STATISTICS ---');
        console.log(`✅ Standard Format:    ${standardCount}`);
        console.log(`⚪ NULL / No Team:     ${nullCount}`);
        console.log(`❌ Irregular Format:   ${irregularTeams.size}`);
        
        if (nullCount > 0) {
            console.log('\n--- NULL TEAM SAMPLES ---');
            nullSamples.forEach(s => console.log(`- ${s}`));
        }

        if (irregularTeams.size > 0) {
            console.log('\n--- IRREGULAR TEAM DETAILS ---');
            Array.from(irregularTeams).sort().forEach(team => {
                console.log(`- ${team.padEnd(20)} | Example: ${samples[team]}`);
            });
        }

        console.log('\n----------------------------');
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
};

checkTeamNames();
