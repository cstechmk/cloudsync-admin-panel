import mongoose, { Schema } from 'mongoose';

const SyncHistorySchema = new Schema(
  {
    uid: { type: String, required: true, index: true },
    cloudProvider: { type: String },
    timestamp: { type: Number },
    bytesPushed: { type: Number },
    filesPushed: { type: Number },
    folderNames: [{ type: String }],
    deviceModel: { type: String },
  },
  { timestamps: false }
);

export const SyncHistory = mongoose.models.SyncHistory || mongoose.model('SyncHistory', SyncHistorySchema, 'sync_history');
