import mongoose from 'mongoose';

const ActivitySchema = new mongoose.Schema({
  stravaId: {
    type: String,
    required: true,
    unique: true, // prevents duplicate activities
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  name: {
    type: String,
  },
  distance: {
    type: Number, // in meters
  },
  movingTime: {
    type: Number, // in seconds
  },
  pace: {
    type: String, // pace in "M:SS" format or similar
  },
  isValid: {
    type: Boolean, // whether this activity met the pace requirements 
    default: true
  },
  type: {
    type: String, // e.g., "Run", "Ride"
  },
  startDate: {
    type: Date,
  }
}, { timestamps: true });

// Add an index to efficiently sort activities by date and filter by type if needed
ActivitySchema.index({ startDate: -1 });

export const Activity = mongoose.model('Activity', ActivitySchema);
