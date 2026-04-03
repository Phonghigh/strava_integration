import mongoose from 'mongoose';

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
    serverSelectionTimeoutMS: 5000, // Fails fast instead of timing out at 10s
  };

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
