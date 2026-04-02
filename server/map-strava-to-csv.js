import fs from 'fs';
import path from 'path';
import stringSimilarity from 'string-similarity';

// Configuration
const CSV_PATH = './src/data/VIETSEEDS RUN 2026 – RUN TO GROW  (Responses) - Form Responses 1.csv';
const JSON_PATH = './users_list.json';
const OUTPUT_PATH = './VIETSEEDS_MAPPED_RESPONSES.csv';

/**
 * Clean prefix from name (e.g. "HCM - 05 - " -> "")
 */
const cleanName = (name) => {
    if (!name) return '';
    // Remove common prefixes like "HCM - 5 -", "HN-1-", "HUE - 2 -"
    return name.replace(/^(hcm|hn|hue|ha noi|ho chi minh|danang|hp|thanh hoa|dong nai|tp hcm|tp ho chi minh|ha noi)[^a-z]*/i, '').trim();
};

/**
 * Normalizes string: removes accents, special characters, and lowercase.
 */
const normalize = (str) => {
    if (!str) return '';
    // Normalize first to handle accents in prefixes
    const normalized = str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[đĐ]/g, 'd')
        .replace(/[^a-z0-9\s]/g, ' ') // Replace special chars with space for better cleaning
        .trim();
        
    const cleaned = cleanName(normalized);
    
    return cleaned
        .replace(/\s+/g, '') // Remove all spaces for the final key
        .trim();
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

/**
 * Manual mapping overrides if needed
 */
const MANUAL_OVERRIDES = {
    // "normalized_name": "strava_id"
};

const runMapping = async () => {
    try {
        console.log('Loading users from DB export...');
        const rawJson = fs.readFileSync(JSON_PATH, 'utf8');
        const dbUsers = JSON.parse(rawJson);

        console.log('Loading form responses CSV...');
        const rawCsv = fs.readFileSync(CSV_PATH, 'utf8');
        const lines = rawCsv.split('\n').filter(l => l.trim());
        
        if (lines.length === 0) {
            console.error('Empty CSV file.');
            return;
        }

        const headerRow = parseCsvLine(lines[0]);
        const nameIdx = headerRow.indexOf('Họ và tên của bạn là gì?');
        const emailIdx = headerRow.indexOf('Email đăng ký');
        
        if (nameIdx === -1) {
            console.error('Column "Họ và tên của bạn là gì?" not found in CSV.');
            return;
        }

        // Add stravaId to header
        headerRow.push('stravaId');
        headerRow.push('mappingAccuracy');

        const outputLines = [headerRow.map(h => `"${h}"`).join(',')];

        let totalMatched = 0;
        let totalFuzzy = 0;
        let totalUnmatched = 0;
        const unmatchedList = [];

        console.log(`Processing ${lines.length - 1} responses...`);

        for (let i = 1; i < lines.length; i++) {
            const row = parseCsvLine(lines[i]);
            const fullNameRaw = row[nameIdx];
            const emailRaw = row[emailIdx];
            const normalizedName = normalize(fullNameRaw);

            let bestMatch = null;
            let bestScore = 0;
            let bestCandidateName = '';

            // 1. Check exact match via Email (highest priority)
            if (emailRaw) {
                const normalizedEmail = emailRaw.toLowerCase().trim();
                const foundByEmail = dbUsers.find(u => u.email && u.email.toLowerCase().trim() === normalizedEmail);
                if (foundByEmail) {
                    bestMatch = foundByEmail;
                    bestScore = 1.1; // Bonus score for email match
                    totalMatched++;
                }
            }

            // 2. Check name matches if no email match
            if (!bestMatch) {
                for (const u of dbUsers) {
                    const dbFullName = `${u.firstName || ''} ${u.lastName || ''}`.trim();
                    const dbNameNormalized = normalize(dbFullName);

                    if (!dbNameNormalized) continue;

                    let score = stringSimilarity.compareTwoStrings(normalizedName, dbNameNormalized);
                    
                    // Word-set similarity (handles reversed names)
                    const words1 = new Set(fullNameRaw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').split(/[^a-z0-9]+/));
                    const words2 = new Set(dbFullName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').split(/[^a-z0-9]+/));
                    
                    // Remove noise/empty strings
                    const ignore = new Set(['', 'tp', 'hcm', 'hn', 'hue', 'ha', 'noi', 'thi', 'van', 'le', 'nguyen']);
                    const filtered1 = [...words1].filter(w => !ignore.has(w));
                    const filtered2 = [...words2].filter(w => !ignore.has(w));

                    if (filtered1.length > 0 && filtered2.length > 0) {
                        const intersection = filtered1.filter(w => filtered2.includes(w));
                        const wordScore = (2 * intersection.length) / (filtered1.length + filtered2.length);
                        score = Math.max(score, wordScore);
                    }

                    // Containment check
                    if (normalizedName.includes(dbNameNormalized) || dbNameNormalized.includes(normalizedName)) {
                        const overlapRatio = Math.min(normalizedName.length, dbNameNormalized.length) / Math.max(normalizedName.length, dbNameNormalized.length);
                        if (overlapRatio > 0.5) {
                            score = Math.max(score, 0.85); 
                        }
                    }

                    if (dbNameNormalized === normalizedName) {
                        bestMatch = u;
                        bestScore = 1.0;
                        totalMatched++;
                        break;
                    }

                    if (score > bestScore) {
                        bestScore = score;
                        bestMatch = u;
                        bestCandidateName = dbFullName;
                    }
                }
            }

            // 3. Final verification and thresholding
            if (bestMatch && bestScore < 1.0) {
                if (bestScore >= 0.8) { // Back to 0.8 as it's safer with the boost
                    totalFuzzy++;
                } else {
                    unmatchedList.push({
                        sheet: fullNameRaw,
                        bestGuess: bestCandidateName,
                        score: Math.round(bestScore * 100)
                    });
                    bestMatch = null; 
                    totalUnmatched++;
                }
            } else if (!bestMatch) {
                totalUnmatched++;
            }

            // Append stravaId to row
            if (bestMatch) {
                row.push(bestMatch.stravaId);
                row.push(`${Math.round(bestScore * 100)}%`);
            } else {
                row.push('');
                row.push('0%');
            }

            outputLines.push(row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','));
        }

        fs.writeFileSync(OUTPUT_PATH, outputLines.join('\n'), 'utf8');

        console.log('\n--- SUCCESS ---');
        console.log(`Saved results to: ${OUTPUT_PATH}`);
        console.log(`Exact Matches: ${totalMatched}`);
        console.log(`Fuzzy Matches: ${totalFuzzy}`);
        console.log(`Unmatched: ${totalUnmatched}`);
        
        if (unmatchedList.length > 0) {
            console.log('\n--- Top 10 Unmatched Examples ---');
            unmatchedList.sort((a, b) => b.score - a.score).slice(0, 10).forEach(u => {
                console.log(`- "${u.sheet}" vs "${u.bestGuess}" (${u.score}%)`);
            });
        }
        console.log('----------------');

    } catch (err) {
        console.error('Error running mapping:', err.message);
    }
};

runMapping();
