import dotenv from 'dotenv';
import { connectDB } from './src/db/connect.js';
import { User } from './src/models/User.model.js';

dotenv.config();

async function check() {
    await connectDB();
    const users = await User.find({
        $or: [
            { city: /USA/i },
            { location: /USA/i }
        ]
    });
    console.log('Users found:', users.length);
    users.forEach(u => {
        console.log(`- ID: ${u._id}, City: ${u.city}, Location: ${u.location}`);
    });
    process.exit(0);
}

check();
