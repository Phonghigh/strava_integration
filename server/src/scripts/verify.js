import dotenv from 'dotenv';
import path from 'path';
import { connectDB } from '../db/connect.js';
import { User } from '../models/User.model.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function verify() {
  await connectDB();
  
  const stravaIds = ['34113137', '35747603', '71674166'];
  
  for (const stravaId of stravaIds) {
    const user = await User.findOne({ stravaId });
    if (user) {
      console.log(`\n--- Verification for ${stravaId} ---`);
      console.log(`Email: ${user.email}`);
      console.log(`Relationship: ${user.relationship}`);
      console.log(`Team Name: ${user.teamName}`);
      console.log(`Generation: ${user.generation}`);
      console.log(`Target Distance: ${user.targetDistance}`);
      console.log(`City: ${user.city}`);
      console.log(`Full Name: ${user.lastName} ${user.firstName}`);
    } else {
      console.log(`User with Strava ID ${stravaId} not found.`);
    }
  }
  
  process.exit(0);
}

verify();
