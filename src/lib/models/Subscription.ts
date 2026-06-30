import mongoose, { Schema } from 'mongoose';

const SubscriptionSchema = new Schema(
  {
    purchaseToken: { type: String, required: true, unique: true, index: true },
    // For Apple subscriptions: the stable identifier across all renewals.
    // Sparse so Google Play records (which have no originalTransactionId) don't conflict.
    originalTransactionId: { type: String, index: true, sparse: true, unique: true },
    userId: { type: String, required: true, index: true },
    userName: { type: String },
    userEmail: { type: String },
    planType: { type: String },
    status: { type: String },
    startDate: { type: Number },
    renewalDate: { type: Number },
    nextBillingDate: { type: Number },
    lastPaymentDate: { type: Number },
    paymentMethod: { type: String },
    amount: { type: Number },
    currency: { type: String },
    formattedPrice: { type: String },
    autoRenew: { type: Boolean },
    billingCycle: { type: String },
    notificationsSent: { type: Number, default: 0 },
    orderId: { type: String },
    updatedAt: { type: Number },
  },
  { timestamps: false }
);

export const Subscription = mongoose.models.Subscription || mongoose.model('Subscription', SubscriptionSchema, 'subscriptions');
