import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { connectDB } from '../db/connect.js';
import { User } from '../models/User.model.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const CSV_FILE = path.resolve(__dirname, '../data/Mapping strava - Trang tính1 (1).csv');

async function mapUsers() {
  try {
    await connectDB();
    console.log('Reading CSV file...');
    
    if (!fs.existsSync(CSV_FILE)) {
      console.error(`CSV file not found: ${CSV_FILE}`);
      process.exit(1);
    }

    const content = fs.readFileSync(CSV_FILE, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim() !== '');
    
    // Skip header
    const dataLines = lines.slice(1);
    
    console.log(`Processing ${dataLines.length} users...`);

    let successCount = 0;
    let errorCount = 0;

    for (const line of dataLines) {
      // Robust split for CSV handling quotes
      const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
      
      if (parts.length < 8) {
        console.warn(`Skipping invalid line: ${line.substring(0, 50)}...`);
        continue;
      }

      const email = parts[0].trim().toLowerCase();
      const relationship = parts[1].trim().replace(/^"|"$/g, '');
      const generation = parts[2].trim().replace(/^"|"$/g, '');
      const teamName = parts[3].trim().replace(/^"|"$/g, '');
      const targetDistance = parts[4].trim().replace(/^"|"$/g, '');
      const city = parts[5].trim().replace(/^"|"$/g, '');
      const fullName = parts[6].trim().replace(/^"|"$/g, '');
      const stravaId = parts[7].trim().replace(/^"|"$/g, '');

      if (!stravaId || stravaId === '') {
        console.warn(`Missing Strava ID for ${email}, skipping...`);
        continue;
      }

      // Split Full Name into Last Name and First Name
      // Standard VN format: [Last Name] [Middle Name] [First Name]
      // We'll take [Last Name] as the first word and the rest as firstName
      const nameParts = fullName.split(' ');
      let lastName = '';
      let firstName = '';
      
      if (nameParts.length > 0) {
        lastName = nameParts[0];
        firstName = nameParts.slice(1).join(' ');
      }

      try {
        await User.findOneAndUpdate(
          { stravaId },
          {
            $set: {
              email,
              relationship,
              generation,
              teamName,
              targetDistance,
              city,
              firstName: firstName || fullName,
              lastName: lastName,
            }
          },
          { upsert: true, new: true }
        );
        successCount++;
        if (successCount % 10 === 0) console.log(`Mapped ${successCount} users...`);
      } catch (err) {
        console.error(`Error mapping user ${stravaId}: ${err.message}`);
        errorCount++;
      }
    }

    console.log('\n--- Mapping Result ---');
    console.log(`Success: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log('-----------------------');

    process.exit(0);
  } catch (err) {
    console.error(`Fatal error: ${err.message}`);
    process.exit(1);
  }
}

mapUsers();
