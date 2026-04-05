import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  stravaId: {
    type: String,
    required: true,
    unique: true,
  },
  firstName: {
    type: String,
  },
  lastName: {
    type: String,
  },
  profile: {
    type: String, // avatar URL
  },
  teamName: {
    type: String,
    default: null,
  },
  generation: {
    type: String, // e.g. "F7", "F8"
  },
  targetDistance: {
    type: String, // e.g. "30km"
  },
  accessToken: {
    type: String,
    required: false,
  },
  refreshToken: {
    type: String,
    required: false,
  },
  tokenExpiresAt: {
    type: Number,
    required: false,
  },
  isAuthorized: {
    type: Boolean,
    default: false,
  },
  location: {
    type: String, // from Strava
  },
  city: {
    type: String, // from Form (e.g. "Hồ Chí Minh")
  },
  relationship: {
    type: String, // e.g. "Seeds", "Alumni"
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
  }
}, { timestamps: true });

export const User = mongoose.model('User', UserSchema);
