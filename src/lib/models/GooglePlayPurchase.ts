import mongoose, { Schema } from 'mongoose';

const GooglePlayPurchaseSchema = new Schema(
  {
    purchaseToken: { type: String, required: true, unique: true, index: true },
    uid: { type: String, index: true },
    planKey: { type: String },
    purchaseType: { type: String },
    productId: { type: String },
    orderId: { type: String },
    status: { type: String },
    activePlan: { type: String },
    expiryAt: { type: Number },
    packageName: { type: String },
    source: { type: String },
    verifiedAt: { type: Number },
    lastSyncedAt: { type: Number },
    raw: { type: Schema.Types.Mixed },
  },
  { timestamps: false }
);

export const GooglePlayPurchase = mongoose.models.GooglePlayPurchase || mongoose.model('GooglePlayPurchase', GooglePlayPurchaseSchema, 'google_play_purchases');
