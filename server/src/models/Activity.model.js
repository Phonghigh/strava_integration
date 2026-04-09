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
    required: false, // Made optional for club feed discovery
  },
  athleteName: {
    type: String, // from feed
  },
  location: {
    type: String, // from feed
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
  },
  polyline: {
    type: String, // Encoded map data
  },
  isDetailScraped: {
    type: Boolean,
    default: false,
  },
  summaryLaps: [{
    id: Number,
    distance: Number,
    movingTime: Number,
    averageSpeed: Number,
    split: Number,
    totalElevationGain: Number
  }],
  // Detailed time-series data
  streams: {
    time: [Number],
    latlng: [[Number]],
    altitude: [Number],
    velocitySmooth: [Number],
    heartrate: [Number],
    cadence: [Number],
    distance: [Number],
    gradeSmooth: [Number]
  },
  // Expanded summary stats
  totalElevationGain: Number,
  elapsedTime: Number,
  calories: Number,
  averageSpeed: Number,
  maxSpeed: Number,
  deviceName: String,
  description: String,
  athleteAvatar: String,
}, { timestamps: true });



// Add an index to efficiently sort activities by date and filter by type if needed
ActivitySchema.index({ startDate: -1 });

export const Activity = mongoose.model('Activity', ActivitySchema);
