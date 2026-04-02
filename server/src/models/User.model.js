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
    default: null, // by default user has no team
  },
  accessToken: {
    type: String,
    required: false, // Optional for crawled users
  },
  refreshToken: {
    type: String,
    required: false, // Optional for crawled users
  },
  tokenExpiresAt: {
    type: Number, // UNIX timestamp from Strava
    required: false, // Optional for crawled users
  },
  isAuthorized: {
    type: Boolean,
    default: false, // Default to false for crawled users
  },
  location: {
    type: String, // e.g. "Ho Chi Minh City, Vietnam"
  }
}, { timestamps: true });

export const User = mongoose.model('User', UserSchema);
