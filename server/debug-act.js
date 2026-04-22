
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Activity } from './src/models/Activity.model.js';
import { User } from './src/models/User.model.js';

dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const stravaId = '17969217691';
  const act = await Activity.findOne({ stravaId });
  console.log('--- Activity Record ---');
  console.log(JSON.stringify(act, null, 2));
  
  await mongoose.disconnect();
}

check();
