import mongoose, { Schema } from 'mongoose';

const UserSchema = new Schema(
  {
    uid: { type: String, required: true, unique: true, index: true },
    name: { type: String },
    displayName: { type: String },
    email: { type: String },
    mobile: { type: String },
    plan: { type: String, default: 'free' },
    status: { type: String, default: 'active' },
    fcmToken: { type: String },
    loginProfile: { type: String },
    activeSyncCloud: { type: String },
    connectedProviders: [{ type: String }],
    lastLogin: { type: Number },
    createdAt: { type: Number },
    planExpiresAt: { type: Number },
    billing: {
      provider: { type: String },
      planKey: { type: String },
      purchaseType: { type: String },
      productId: { type: String },
      purchaseToken: { type: String },
      orderId: { type: String },
      status: { type: String },
      expiryAt: { type: Number },
      verifiedAt: { type: Number },
      lastSyncedAt: { type: Number },
    },
    uploadStats: {
      totalBytesUploaded: { type: Number, default: 0 },
      totalFilesUploaded: { type: Number, default: 0 },
      syncCount: { type: Number, default: 0 },
      lastSyncBytes: { type: Number },
      lastSyncTimestamp: { type: Number },
    },
    settings: {
      autoSync: { type: Boolean, default: true },
      wifiOnly: { type: Boolean, default: true },
      downloadSync: { type: Boolean, default: true },
      folderPaths: [{ type: String }],
      deviceId: { type: String },
      fileTypeFilter: { type: String, default: '' },
      syncIntervalMinutes: { type: Number, default: 1440 },
    },
    deviceInfo: { type: Schema.Types.Mixed },
    appInfo: { type: Schema.Types.Mixed },
    syncData: { type: Schema.Types.Mixed },
    address: { type: String },
    city: { type: String },
    state: { type: String },
    pincode: { type: String },
  },
  { timestamps: false }
);

export const User = mongoose.models.User || mongoose.model('User', UserSchema, 'users');
