/* eslint-disable @typescript-eslint/no-require-imports */
const admin = require('firebase-admin');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables relative to the script location
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('ERROR: MONGO_URI is not defined in .env');
  process.exit(1);
}

// 1. Initialize Firebase Admin relative to script location
const serviceAccountPath = path.join(__dirname, '../service-account.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error('ERROR: service-account.json not found in root directory');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const firestore = admin.firestore();

// 2. Define Mongoose Schemas & Models inside the script for TS-independent execution
const UserSchema = new mongoose.Schema({
  _id: String,
  name: String,
  displayName: String,
  email: String,
  mobile: String,
  plan: { type: String, default: 'free' },
  status: { type: String, default: 'active' },
  fcmToken: String,
  loginProfile: String,
  activeSyncCloud: String,
  connectedProviders: [String],
  lastLogin: Number,
  createdAt: Number,
  planExpiresAt: Number,
  billing: mongoose.Schema.Types.Mixed,
  uploadStats: mongoose.Schema.Types.Mixed,
  settings: mongoose.Schema.Types.Mixed,
}, { _id: false });

const SubscriptionSchema = new mongoose.Schema({
  _id: String,
  userId: String,
  userName: String,
  userEmail: String,
  planType: String,
  status: String,
  startDate: Number,
  renewalDate: Number,
  nextBillingDate: Number,
  lastPaymentDate: Number,
  paymentMethod: String,
  amount: Number,
  currency: String,
  autoRenew: Boolean,
  billingCycle: String,
  notificationsSent: Number,
  orderId: String,
  updatedAt: Date,
}, { _id: false });

const NotificationSchema = new mongoose.Schema({
  title: String,
  body: String,
  target: String,
  targetPlan: String,
  targetUserId: String,
  notificationType: String,
  redirectUrl: String,
  imageUrl: String,
  sentCount: Number,
  failedCount: Number,
  totalTargeted: Number,
  sentAt: Date,
});

const GooglePlayPurchaseSchema = new mongoose.Schema({
  _id: String,
  uid: String,
  planKey: String,
  purchaseType: String,
  purchaseToken: String,
  productId: String,
  orderId: String,
  status: String,
  activePlan: String,
  expiryAt: Number,
  packageName: String,
  source: String,
  verifiedAt: Date,
  lastSyncedAt: Date,
  raw: mongoose.Schema.Types.Mixed,
}, { _id: false });

const SyncHistorySchema = new mongoose.Schema({
  userId: { type: String, index: true },
  cloudProvider: String,
  timestamp: Number,
  bytesPushed: Number,
  filesPushed: Number,
});

const User = mongoose.model('MigrateUser', UserSchema, 'users');
const Subscription = mongoose.model('MigrateSubscription', SubscriptionSchema, 'subscriptions');
const Notification = mongoose.model('MigrateNotification', NotificationSchema, 'notifications');
const GooglePlayPurchase = mongoose.model('MigrateGooglePlayPurchase', GooglePlayPurchaseSchema, 'google_play_purchases');
const SyncHistory = mongoose.model('MigrateSyncHistory', SyncHistorySchema, 'sync_histories');

// 3. Serialization Helpers
function serializeFirestoreValue(val) {
  if (val === null || val === undefined) return val;
  // Firestore Timestamp
  if (typeof val.toMillis === 'function') {
    return val.toDate(); // MongoDB Mongoose schema handles Date casting
  }
  if (Array.isArray(val)) {
    return val.map(serializeFirestoreValue);
  }
  if (typeof val === 'object') {
    const res = {};
    for (const [k, v] of Object.entries(val)) {
      res[k] = serializeFirestoreValue(v);
    }
    return res;
  }
  return val;
}

// 4. Main Migration Runner
async function run() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('MongoDB connected successfully!');

  // --- Users & SyncHistory Migration ---
  console.log('\n--- Migrating Users & Sync History ---');
  const usersSnap = await firestore.collection('users').get();
  console.log(`Found ${usersSnap.size} user documents in Firestore.`);
  
  let migratedUsers = 0;
  let migratedHistory = 0;

  for (const doc of usersSnap.docs) {
    const uid = doc.id;
    const data = serializeFirestoreValue(doc.data());
    
    // Upsert User
    await User.findByIdAndUpdate(uid, { $set: data }, { upsert: true });
    migratedUsers++;

    // Fetch Sync History subcollection
    const historySnap = await firestore.collection('users').doc(uid).collection('syncHistory').get();
    if (historySnap.size > 0) {
      for (const histDoc of historySnap.docs) {
        const histData = serializeFirestoreValue(histDoc.data());
        // Insert into flat MongoDB sync_histories collection
        await SyncHistory.create({
          userId: uid,
          cloudProvider: histData.cloudProvider,
          timestamp: histData.timestamp,
          bytesPushed: histData.bytesPushed,
          filesPushed: histData.filesPushed,
        });
        migratedHistory++;
      }
    }
  }
  console.log(`Successfully migrated ${migratedUsers} Users.`);
  console.log(`Successfully migrated ${migratedHistory} Sync History records.`);

  // --- Subscriptions Migration ---
  console.log('\n--- Migrating Subscriptions ---');
  const subsSnap = await firestore.collection('subscriptions').get();
  console.log(`Found ${subsSnap.size} subscriptions in Firestore.`);
  
  let migratedSubs = 0;
  for (const doc of subsSnap.docs) {
    const token = doc.id;
    const data = serializeFirestoreValue(doc.data());
    await Subscription.findByIdAndUpdate(token, { $set: data }, { upsert: true });
    migratedSubs++;
  }
  console.log(`Successfully migrated ${migratedSubs} Subscriptions.`);

  // --- Google Play Purchases Migration ---
  console.log('\n--- Migrating Google Play Purchases ---');
  const purchaseSnap = await firestore.collection('google_play_purchases').get();
  console.log(`Found ${purchaseSnap.size} Google Play purchase records in Firestore.`);
  
  let migratedPurchases = 0;
  for (const doc of purchaseSnap.docs) {
    const token = doc.id;
    const data = serializeFirestoreValue(doc.data());
    await GooglePlayPurchase.findByIdAndUpdate(token, { $set: data }, { upsert: true });
    migratedPurchases++;
  }
  console.log(`Successfully migrated ${migratedPurchases} Google Play Purchase records.`);

  // --- Notifications Migration ---
  console.log('\n--- Migrating Notifications ---');
  const notifSnap = await firestore.collection('notifications').get();
  console.log(`Found ${notifSnap.size} notifications in Firestore.`);
  
  let migratedNotifs = 0;
  for (const doc of notifSnap.docs) {
    const data = serializeFirestoreValue(doc.data());
    // Notifications have no fixed custom ID in Firestore, let MongoDB generate ObjectId
    await Notification.create(data);
    migratedNotifs++;
  }
  console.log(`Successfully migrated ${migratedNotifs} Notifications.`);

  console.log('\n=====================================');
  console.log('Migration Completed Successfully!');
  console.log('=====================================');
}

run()
  .catch(err => {
    console.error('Migration failed:', err);
  })
  .finally(() => {
    mongoose.disconnect();
  });
