import fs from 'fs';

const INPUT_PATH = './VIETSEEDS_MAPPED_RESPONSES.csv';
const OUTPUT_PATH = './VIETSEEDS_FINAL.csv';

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

const shortCity = (city) => {
    if (!city) return '';
    const c = city.toLowerCase();
    if (c.includes('ho chi minh') || c.includes('hcm')) return 'HCM';
    if (c.includes('ha noi') || c.includes('hn')) return 'HN';
    if (c.includes('hue')) return 'HUE';
    // Clean others: remove "TP." or "Thành phố"
    return city.replace(/^(tp\.|thanh pho)\s+/i, '').trim().toUpperCase();
};

const prependTeamNames = () => {
    try {
        console.log('Reading CSV...');
        const rawCsv = fs.readFileSync(INPUT_PATH, 'utf8');
        const lines = rawCsv.split('\n').filter(l => l.trim());
        
        if (lines.length < 3) {
            console.log('Not enough lines to process.');
            return;
        }

        const newLines = [];
        // Keep headers (lines 0 and 1)
        newLines.push(lines[0]);
        newLines.push(lines[1]);

        console.log(`Processing ${lines.length - 2} rows...`);

        for (let i = 2; i < lines.length; i++) {
            const row = parseCsvLine(lines[i]);
            
            const originalName = row[1];
            const cityRaw = row[4];
            const groupRaw = row[6];

            const city = shortCity(cityRaw);
            const group = groupRaw ? groupRaw.trim() : '';

            let teamPrefix = '';
            if (city && group) {
                teamPrefix = `${city} - ${group} - `;
            } else if (city) {
                teamPrefix = `${city} - `;
            } else if (group) {
                teamPrefix = `${group} - `;
            }

            // Avoid double prepending if it already has it
            if (originalName.startsWith(teamPrefix)) {
                row[1] = originalName;
            } else {
                row[1] = teamPrefix + originalName;
            }

            newLines.push(row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','));
        }

        fs.writeFileSync(OUTPUT_PATH, newLines.join('\n'), 'utf8');
        console.log(`SUCCESS: Processed results saved to ${OUTPUT_PATH}`);

    } catch (err) {
        console.error('Error:', err.message);
    }
};

prependTeamNames();
