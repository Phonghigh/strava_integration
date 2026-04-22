import fs from 'fs';
import path from 'path';
import { connectDB } from '../db/connect.js';
import { User } from '../models/User.model.js';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const CSV_PATH = './src/data/Mapping strava - Trang tính1 (1).csv';

/**
 * Robust CSV Line Parser (handles commas inside quotes)
 */
const parseCsvLine = (line) => {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(cur.trim());
            cur = '';
        } else {
            cur += char;
        }
    }
    result.push(cur.trim());
    return result;
};

/**
 * Normalizes city names to HCM, HN, Huế
 */
const shortCity = (city) => {
    if (!city) return '';
    const c = city.toLowerCase();
    if (c.includes('hồ chí minh') || c.includes('hcm')) return 'HCM';
    if (c.includes('hà nội') || c.includes('hn')) return 'HN';
    if (c.includes('huế')) return 'Huế';
    return '';
};

const updateDatabase = async () => {
    try {
        await connectDB();
        console.log('✅ Connected to MongoDB');

        const absoluteCsvPath = path.resolve(process.cwd(), CSV_PATH);
        const rawCsv = fs.readFileSync(absoluteCsvPath, 'utf8');
        const lines = rawCsv.split('\n').filter(l => l.trim());

        console.log(`📊 Processing ${lines.length - 1} users from CSV...`);

        let updatedCount = 0;
        let nullCount = 0;
        let notFoundCount = 0;

        for (let i = 1; i < lines.length; i++) {
            const row = parseCsvLine(lines[i]);
            if (row.length < 8) continue;

            const email = row[0];
            const relationship = row[1];
            const generation = row[2];
            const group = row[3];
            const targetDistance = row[4];
            const cityRaw = row[5];
            const stravaId = row[7].trim();

            if (!stravaId || stravaId === 'Strava ID') continue;

            const city = shortCity(cityRaw);
            
            // New Rule: "Nhóm + N + Rooftop" ONLY if both city (standard) and group exist
            let teamName = null;
            if (city && group) {
                const paddedGroup = group.toString().trim().padStart(2, '0');
                teamName = `Nhóm ${paddedGroup} ${city}`;
            }

            const updateData = {
                teamName: teamName, // Can be null now
                generation: generation || '',
                targetDistance: targetDistance || '',
                email: email ? email.toLowerCase().trim() : undefined,
                relationship: relationship || '',
                city: cityRaw || ''
            };

            const user = await User.findOneAndUpdate(
                { stravaId: String(stravaId) },
                { $set: updateData },
                { new: true }
            );

            if (user) {
                updatedCount++;
                if (!teamName) nullCount++;
            } else {
                notFoundCount++;
            }
        }

        console.log(`\n🔍 Running name-based backup mapping for users with NO team...`);
        const allNullUsers = await User.find({ 
            $or: [
                { teamName: null },
                { teamName: 'No Team' },
                { teamName: '' }
            ]
        });

        let nameBasedUpdated = 0;
        const nameRegex = /^[\s-]*(\d+)[\s-]*(.*)$/;

        for (const user of allNullUsers) {
            const { firstName, lastName } = user;
            if (!firstName || !lastName) continue;

            const match = lastName.trim().match(nameRegex);
            if (match) {
                const group = match[1];
                const region = firstName.trim();

                let city = null;
                if (region.toLowerCase() === 'hcm') city = 'HCM';
                else if (region.toLowerCase() === 'hn') city = 'HN';
                else if (region.toLowerCase().includes('huế') || region.toLowerCase().includes('hue')) city = 'Huế';

                if (city && group) {
                    const paddedGroup = group.toString().trim().padStart(2, '0');
                    const newTeamName = `Nhóm ${paddedGroup} ${city}`;
                    await User.updateOne({ _id: user._id }, { $set: { teamName: newTeamName } });
                    nameBasedUpdated++;
                } else {
                    // Force null if it doesn't match standard format
                    await User.updateOne({ _id: user._id }, { $set: { teamName: null } });
                }
            } else {
                // If it doesn't match the regex but has some value, set to null per user request
                if (user.teamName) {
                    await User.updateOne({ _id: user._id }, { $set: { teamName: null } });
                }
            }
        }

        // Final cleanup: any teamName that doesn't follow the "Nhóm \d{2} (HCM|HN|Huế)" format sets to null
        const finalCheck = await User.find({ teamName: { $ne: null } });
        const standardFormat = /^Nhóm \d{2} (HCM|HN|Huế)$/;
        let finalCleaned = 0;
        for (const user of finalCheck) {
            if (!standardFormat.test(user.teamName)) {
                await User.updateOne({ _id: user._id }, { $set: { teamName: null } });
                finalCleaned++;
            }
        }

        console.log('\n--- FINAL UPDATE SUMMARY ---');
        console.log(`✅ CSV Processed:       ${updatedCount}`);
        console.log(`💡 Name-based matches:  ${nameBasedUpdated}`);
        console.log(`🚮 Reset to NULL:      ${nullCount + (finalCleaned)} (Non-standard/Other provinces)`);
        console.log(`⚠️ Users not in DB:    ${notFoundCount}`);
        console.log(`-----------------------------`);

        process.exit(0);
    } catch (err) {
        console.error('❌ Error during update:', err);
        process.exit(1);
    }
};

updateDatabase();
