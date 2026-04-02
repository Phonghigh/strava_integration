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
  accessToken: {
    type: String,
    required: true,
  },
  refreshToken: {
    type: String,
    required: true,
  },
  tokenExpiresAt: {
    type: Number, // UNIX timestamp from Strava
    required: true,
  }
}, { timestamps: true });

export const User = mongoose.model('User', UserSchema);
