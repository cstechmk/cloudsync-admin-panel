import mongoose, { Schema } from 'mongoose';

// originalTransactionId is the stable key across all renewals (analogous to Google's purchaseToken).
// transactionId changes on every renewal; we store the latest one.
const AppStorePurchaseSchema = new Schema(
  {
    originalTransactionId: { type: String, required: true, unique: true, index: true },
    transactionId: { type: String, index: true },
    uid: { type: String, index: true },
    planKey: { type: String },
    purchaseType: { type: String },
    productId: { type: String },
    bundleId: { type: String },
    status: { type: String },
    activePlan: { type: String },
    environment: { type: String },
    expiryAt: { type: Number },
    purchaseDate: { type: Number },
    revocationDate: { type: Number },
    source: { type: String },
    verifiedAt: { type: Number },
    lastSyncedAt: { type: Number },
    raw: { type: Schema.Types.Mixed },
  },
  { timestamps: false }
);

export const AppStorePurchase =
  mongoose.models.AppStorePurchase ||
  mongoose.model('AppStorePurchase', AppStorePurchaseSchema, 'app_store_purchases');
