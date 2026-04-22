import mongoose from 'mongoose';
import dns from 'node:dns';

// Force DNS to prefer IPv4.
dns.setDefaultResultOrder('ipv4first');

// Bypass broken local DNS (192.168.1.1) by using Google DNS for resolution
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
  console.log("DNS servers set to Google (8.8.8.8, 8.8.4.4)");
} catch (e) {
  console.warn("Could not set DNS servers explicitly:", e.message);
}

let cachedPromise = null;

export const connectDB = async () => {
  if (cachedPromise) {
    return cachedPromise;
  }

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is missing.');
  }

  const opts = {
    bufferCommands: true, // Allow waiting for connection
    serverSelectionTimeoutMS: 10000, // Increased timeout for reliability
    family: 4, // Force IPv4
  };

  console.log("Connecting to MongoDB via IPv4...");
  cachedPromise = mongoose.connect(process.env.MONGODB_URI, opts).then((mongooseInstance) => {
    console.log(`✅ MongoDB Connected: ${mongooseInstance.connection.host}`);
    return mongooseInstance;
  }).catch((error) => {
    cachedPromise = null;
    console.error(`❌ Error connecting to MongoDB: ${error.message}`);
    throw error;
  });

  return cachedPromise;
};
