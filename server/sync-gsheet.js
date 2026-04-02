import axios from 'axios';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import stringSimilarity from 'string-similarity';
import { User } from './src/models/User.model.js';

// Load environment variables
dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('SUCCESS: Connected to MongoDB');
    } catch (err) {
        console.error('ERROR: Could not connect to MongoDB:', err.message);
        process.exit(1);
    }
};

/**
 * Manual mapping for users whose Google Sheet names differ drastically from Strava names.
 * Format: { "Normalized Sheet Name": "stravaId" OR "Known Email" }
 */
const MANUAL_MAPPINGS = {
    // Example: "Nguyen Van A": "12345678" (Strava ID)
    // "levana": "strava_id_here",
};

// Model is now imported from src/models/User.model.js

const shortCity = (city) => {
    if (!city) return '';
    const c = city.toLowerCase();
    if (c.includes('ho chi minh') || c.includes('hcm')) return 'HỒ CHÍ MINH';
    if (c.includes('ha noi') || c.includes('hn')) return 'HÀ NỘI';
    if (c.includes('hue')) return 'HUẾ';
    // Clean others: remove "TP." or "Thành phố"
    return city.replace(/^(tp\.|thanh pho)\s+/i, '').trim().toUpperCase();
};

/**
 * Sync data from Google Sheet (CSV format)
 */
/**
 * Helper to remove Vietnamese accents and normalize string
 */
const normalize = (str) => {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[đĐ]/g, 'd')
        .replace(/[^a-z0-9]/g, '') // Keep only alphanumeric
        .trim();
};

/**
 * Clean prefix from name (e.g. "HCM - 05 - " -> "")
 */
const cleanName = (name) => {
    if (!name) return '';
    // Remove common prefixes like "HCM - 5 -", "HN-1-", "HUE - 2 -"
    return name.replace(/^(hcm|hn|hue|ha noi|ho chi minh|danang|hp|thanh hoa|dong nai)[^a-zA-Z]*/i, '').trim();
};

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

const syncGoogleSheet = async () => {
    const SHEET_ID = '1-S9CEb-Miu5Yj5hNKQ7iJEXDVy616Ybrdevuf-z9SOA';
    const GID = '1392267322';
    const URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;

    console.log('--------------------------------------------------');
    console.log('Fetching data from Google Sheet...');
    
    try {
        const response = await axios.get(URL);
        const rows = response.data.split('\r\n').filter(l => l.trim()); // Handle Windows line endings
        
        // Fetch all existing users
        const allUsers = await User.find({});
        console.log(`Comparing with ${allUsers.length} users in database.`);
        if (allUsers.length > 0) {
            const first = allUsers[0];
            console.log(`Sample DB Name: "${first.firstName} ${first.lastName}"`);
        }

        let matched = 0;
        let notFound = [];
        const unmatchedSuggestions = [];

        for (let i = 1; i < rows.length; i++) {
            const row = parseCsvLine(rows[i]);
            
            // Map based on the observed structure
            const sheetUser = {
                name: row[1],
                email: row[2],
                relationship: row[3],
                city: row[4],
                group: row[6]
            };

            if (!sheetUser.name || sheetUser.name === 'Họ và tên của bạn là gì?') continue;

            const normalizedSheetName = normalize(sheetUser.name);
            
            // Try to find match
            let foundUser = null;

            // 1. Check manual mappings
            if (MANUAL_MAPPINGS[normalizedSheetName]) {
                const identifier = MANUAL_MAPPINGS[normalizedSheetName];
                foundUser = allUsers.find(u => u.stravaId === identifier || u.email === identifier);
                if (foundUser) {
                    // console.log(`[Manual Match] "${sheetUser.name}" -> ${foundUser.firstName} ${foundUser.lastName}`);
                }
            }

            // 2. Try exact match if not found manually
            if (!foundUser) {
                for (const u of allUsers) {
                    const dbFullName = `${u.firstName || ''} ${u.lastName || ''}`.trim();
                    const dbNameCleaned = cleanName(dbFullName);
                    
                    const isMatch = normalize(dbNameCleaned) === normalizedSheetName || 
                                   normalize(dbFullName) === normalizedSheetName;

                    if (isMatch) {
                        foundUser = u;
                        break;
                    }
                }
            }

            // 3. Try fuzzy match with higher threshold
            if (!foundUser) {
                let bestScore = 0;
                let candidate = null;

                for (const u of allUsers) {
                    const dbFullName = `${u.firstName || ''} ${u.lastName || ''}`.trim();
                    const dbNameCleaned = cleanName(dbFullName);
                    
                    const score1 = stringSimilarity.compareTwoStrings(normalizedSheetName, normalize(dbFullName));
                    const score2 = stringSimilarity.compareTwoStrings(normalizedSheetName, normalize(dbNameCleaned));
                    
                    const maxScore = Math.max(score1, score2);
                    
                    if (maxScore > bestScore) {
                        bestScore = maxScore;
                        candidate = u;
                    }
                }

                if (candidate && bestScore > 0.8) { // threshold
                    // console.log(`[Fuzzy Match ${Math.round(bestScore*100)}%] "${sheetUser.name}" -> "${candidate.firstName} ${candidate.lastName}"`);
                    foundUser = candidate;
                } else if (candidate && bestScore > 0.5) {
                    unmatchedSuggestions.push({
                        sheet: sheetUser.name,
                        bestGuess: `${candidate.firstName} ${candidate.lastName}`,
                        score: Math.round(bestScore * 100)
                    });
                }
            }

            if (foundUser) {
                const cityShort = shortCity(sheetUser.city);
                const teamName = sheetUser.group ? `${cityShort} - ${sheetUser.group}` : cityShort;
                const namePrefix = teamName ? `${teamName} - ` : '';

                await User.findByIdAndUpdate(foundUser._id, {
                    $set: {
                        email: sheetUser.email,
                        group: sheetUser.group,
                        city: sheetUser.city,
                        relationship: sheetUser.relationship,
                        teamName: teamName, // Full team name for grouping (e.g. HCM - 11)
                        firstName: foundUser.firstName.startsWith(namePrefix) ? foundUser.firstName : namePrefix + foundUser.firstName,
                        updatedAt: new Date()
                    }
                });
                matched++;
            } else {
                notFound.push(sheetUser.name);
            }
        }

        console.log(`SUCCESS: Matched and updated ${matched} users.`);
        
        if (unmatchedSuggestions.length > 0) {
            console.log('\n--- Suggestions for Manual Override ---');
            unmatchedSuggestions.slice(0, 10).forEach(s => {
                console.log(`- "${s.sheet}" looks like "${s.bestGuess}" (${s.score}%)? Add if correct.`);
            });
        }

        if (notFound.length > 0) {
            console.log(`\nWARNING: Could not find ${notFound.length} users on Strava.`);
            console.log(`First 10 missing: ${notFound.slice(0, 10).join(', ')}`);
        }
        console.log('--------------------------------------------------');

    } catch (error) {
        console.error('Failed to sync Google Sheet:', error.message);
    }
};

// Execute
(async () => {
    await connectDB();
    await syncGoogleSheet();
    mongoose.connection.close();
})();
