import dotenv from 'dotenv';
import { connectDB } from './src/db/connect.js';
import { User } from './src/models/User.model.js';
import { Activity } from './src/models/Activity.model.js';

dotenv.config();

async function listLocations() {
  await connectDB();
  
  const userCities = await User.distinct('city');
  const userLocations = await User.distinct('location');
  const activityLocations = await Activity.distinct('location');
  
  const allLocations = new Set([
    ...userCities.filter(Boolean),
    ...userLocations.filter(Boolean),
    ...activityLocations.filter(Boolean)
  ]);
  
  const sortedLocations = Array.from(allLocations).sort();
  
  console.log('\n--- Unique Locations Found in DB ---');
  console.log(`Total: ${sortedLocations.length}`);
  sortedLocations.forEach(loc => console.log(`- ${loc}`));
  
  process.exit(0);
}

listLocations();
