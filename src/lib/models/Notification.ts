import mongoose, { Schema } from 'mongoose';

const NotificationSchema = new Schema(
  {
    title: { type: String, required: true },
    body: { type: String, required: true },
    target: { type: String, required: true },
    targetPlan: { type: String },
    targetUserId: { type: String },
    notificationType: { type: String, default: 'text' },
    redirectUrl: { type: String },
    imageUrl: { type: String },
    sentCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    totalTargeted: { type: Number, default: 0 },
    sentAt: { type: Number, default: () => Date.now() },
  },
  { timestamps: false }
);

export const Notification = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema, 'notifications');
