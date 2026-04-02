import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Activity } from './src/models/Activity.model.js';
import { User } from './src/models/User.model.js';

dotenv.config();

const testStats = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const totalResult = await Activity.aggregate([
            { $match: { isValid: true } },
            { $group: { _id: null, totalKm: { $sum: "$distance" }, activitiesCount: { $sum: 1 } } }
        ]);
        
        console.log('Total Result:', totalResult);
        
        const currentKm = (totalResult[0]?.totalKm || 0) / 1000;
        console.log('Current Km:', currentKm);

        const totalRunners = await User.countDocuments();
        console.log('Total Runners:', totalRunners);

        mongoose.connection.close();
    } catch (err) {
        console.error('Test Failed:', err);
        process.exit(1);
    }
};

testStats();
