/**
 * Exact MongoDB document schemas for all 5 collections.
 * Use these as the canonical reference for data migration.
 *
 * Notes:
 *  - _id is MongoDB ObjectId (auto-generated), exposed as `id` string via toPlain()
 *  - All timestamps are epoch milliseconds (number), NOT Date objects, NOT Firestore Timestamps
 *  - Fields marked optional (?) may be absent on older documents
 *  - `uid` = Firebase Auth UID — primary lookup key on the `users` collection
 *
 * Verified against: all API routes in src/app/api/ and src/lib/google-play.ts
 * Last verified: 2026-06-18
 */

// ─── users ────────────────────────────────────────────────────────────────────
// Primary key: { uid: string }  (unique index recommended)
// Upsert key:  { uid }
//
// Written by:
//   PATCH /api/users/[uid]        — admin or app update (allowed field list enforced)
//   PUT  /api/users/[uid]/sync    — device sync upsert ($setOnInsert protects plan/status)
//   POST /api/users/[uid]/stats   — atomic $inc on uploadStats.*
//   google-play.ts                — writes plan, planExpiresAt, billing on purchase verify

export interface UserDocument {
  // Identity
  uid: string;                        // Firebase Auth UID — required, index key
  email?: string;
  name?: string;
  displayName?: string;               // legacy alias for name (stored by older app versions)
  mobile?: string;
  loginProfile?: string;              // "google" | "ftp" | "onedrive" | "dropbox"
  fcmToken?: string;                  // Firebase Cloud Messaging device token

  // Plan & status — ONLY written by admin panel or google-play.ts verify
  // Device sync uses $setOnInsert so these are never overwritten by the app
  plan: string;                       // "free" | "yearly" | "lifetime"  (default: "free")
  status: string;                     // "active" | "suspended" | "banned"  (default: "active")
  planExpiresAt?: number | null;      // epoch ms; null for lifetime/free

  // Billing — written by google-play.ts verifyGooglePlayPurchase()
  billing?: {
    provider: 'google_play';
    purchaseType: 'subscription' | 'one_time';
    productId: string;
    purchaseToken: string;
    orderId: string | null;
    status: 'active' | 'expired' | 'pending' | 'canceled' | 'revoked';
    planKey: string;
    expiryAt: number | null;
    verifiedAt: number;               // epoch ms
    lastSyncedAt: number;             // epoch ms
  };

  // Cloud sync configuration
  activeSyncCloud?: string;           // "google_drive" | "onedrive" | "ftp" | "dropbox"
  connectedProviders?: string[];

  // Settings — synced from device via sync/PATCH routes
  settings?: {
    autoSync?: boolean;
    wifiOnly?: boolean;
    downloadSync?: boolean;
    folderPaths?: string[];           // SAF content:// URIs
    deviceId?: string;
  };

  // Device info — synced from device
  deviceInfo?: {
    manufacturer?: string;
    model?: string;
    brand?: string;
    androidVersion?: string;
    sdkInt?: number;
    hardware?: string;
  };

  // App info — synced from device
  appInfo?: {
    versionName?: string;
    versionCode?: number | string;    // Long on Android 28+, int below
    packageName?: string;
  };

  // Sync size data — calculated on device, pushed via PATCH /api/users/[uid]
  syncData?: {
    totalSizeBytes?: number;
    lastCalculated?: number;          // epoch ms
    folders?: Array<{
      uri?: string;                   // SAF content:// URI
      sizeBytes?: number;
      fileCount?: number;
    }>;
  };

  // Upload statistics — incremented atomically via POST /api/users/[uid]/stats
  // Never set directly — always use $inc / $set operators
  uploadStats?: {
    totalBytesUploaded?: number;
    totalFilesUploaded?: number;
    syncCount?: number;
    lastSyncBytes?: number;
    lastSyncFiles?: number;
    lastSyncTimestamp?: number;       // epoch ms
  };

  // Address fields — optional, user-provided
  pincode?: string;
  address?: string;
  city?: string;
  state?: string;

  // Timestamps
  lastLogin?: number;                 // epoch ms — updated on every device sync
  createdAt?: number;                 // epoch ms — set once via $setOnInsert, never updated
}

// ─── sync_history ─────────────────────────────────────────────────────────────
// Primary key: _id (ObjectId)
// Query key:   { uid }  +  { uid, timestamp: { $lt: lastTimestamp } } for cursor pagination
// Sort:        { timestamp: -1 }
// Max returned per request: 50 (enforced in route)
//
// Written by:  POST /api/users/[uid]/history
// Deleted by:  DELETE /api/users/[uid]/history  (deleteMany by uid)

export interface SyncHistoryDocument {
  uid: string;                        // Firebase Auth UID — foreign key to users
  timestamp: number;                  // epoch ms of the sync event
  cloudProvider: string;              // "google_drive" | "onedrive" | "ftp" | "dropbox" | "unknown"
  bytesPushed: number;
  filesPushed: number;
  folderNames: string[];              // human-readable names (not full URIs)
  deviceModel: string;                // e.g. "Samsung Galaxy S21"
}

// ─── subscriptions ────────────────────────────────────────────────────────────
// Primary key: { purchaseToken: string }  (unique index recommended)
// Upsert key:  { purchaseToken }
//
// Written by:  google-play.ts verifyGooglePlayPurchase() — always upsert
// Updated by:  PATCH /api/subscriptions/[id]  (id = purchaseToken)
// Deleted by:  DELETE /api/subscriptions/[id]
//
// NOTE: `productId` is NOT written by the initial subscription upsert in google-play.ts.
// It only exists if set explicitly. Do not rely on it for all records.

export interface SubscriptionDocument {
  userId: string;                     // Firebase Auth UID
  purchaseToken: string;              // Google Play purchase token — lookup key

  // Denormalized user display fields (snapshot at time of purchase)
  userName?: string;                  // from users.displayName || users.name
  userEmail?: string;                 // from users.email

  // Plan
  planType: string;                   // "yearly" | "lifetime" | "monthly"
  billingCycle: 'monthly' | 'yearly' | 'lifetime';

  // Status — written by google-play.ts; updated by admin via PATCH
  status: 'active' | 'inactive' | 'expiring_soon' | 'expired' | 'canceled' | 'revoked' | 'pending';
  autoRenew: boolean;                 // false for lifetime; false if canceled/revoked

  // Payment details
  paymentMethod: 'google_play';
  amount?: number;                    // numeric amount, e.g. 9.99
  currency?: string;                  // ISO 4217, e.g. "USD" or "INR"
  formattedPrice?: string;            // display string, e.g. "₹499"
  orderId?: string | null;            // Google Play order ID

  // Dates (all epoch ms)
  startDate?: number;                 // first purchase — preserved on upsert via existingSub?.startDate
  renewalDate?: number | null;        // next renewal epoch ms; null for lifetime
  nextBillingDate?: number | null;    // same value as renewalDate
  lastPaymentDate?: number;           // updated only when orderId changes (new payment)
  updatedAt?: number;                 // epoch ms — set on every write

  // Counters
  notificationsSent?: number;         // renewal reminder count — preserved on upsert
}

// ─── google_play_purchases ────────────────────────────────────────────────────
// Primary key: { purchaseToken: string }  (unique index recommended)
// Upsert key:  { purchaseToken }
//
// Written by:  google-play.ts verifyGooglePlayPurchase() and syncGooglePlayPurchaseFromNotification()
// Read by:     cancelGooglePlaySubscription(), refundAndRevokeGooglePlaySubscription()
//              (these need packageName + productId from this collection)

export interface GooglePlayPurchaseDocument {
  uid: string | null;                 // Firebase Auth UID; null if webhook arrived before login
  planKey: string;                    // "yearly" | "lifetime"
  purchaseType: 'subscription' | 'one_time';
  purchaseToken: string;              // lookup key
  productId: string;                  // Google Play product/subscription ID — required for cancel/refund API calls
  orderId: string | null;
  status: 'active' | 'expired' | 'pending' | 'canceled' | 'revoked';
  activePlan: string;                 // resolved after normalization; "free" if not active
  expiryAt: number | null;            // epoch ms; null for one_time/lifetime
  packageName: string;                // e.g. "com.calley.cloudsync" — required for GP API calls
  source: string;                     // "direct" | "client_verify" | "rtdn_subscription" | "rtdn_product" | "webhook"
  verifiedAt: number;                 // epoch ms — last time GP API was called
  lastSyncedAt: number;               // epoch ms — same as verifiedAt on each write
  raw: Record<string, unknown>;       // raw Google Play API response body
}

// ─── notifications ────────────────────────────────────────────────────────────
// Primary key: _id (ObjectId)
// Sort:        { sentAt: -1 }
// Limit:       30 returned per GET request
//
// Written by:  POST /api/notifications  (body spread + sentAt injected by backend)
// Deleted by:  DELETE /api/notifications/[id]  (id = _id hex string)
//
// This is a log — the POST /api/send-notification route sends the FCM push,
// then the admin UI separately calls POST /api/notifications to log it.
// These are two distinct operations; the notification document is NOT the FCM message.

export interface NotificationDocument {
  title: string;
  body: string;
  imageUrl?: string;
  url?: string;                       // deep-link or web URL in notification tap action
  notificationType?: string;          // "broadcast" | "targeted" | "plan_expiry" | custom
  target?: string;                    // "all" | "plan:yearly" | specific uid
  targetPlan?: string;
  targetUserId?: string;
  sentCount?: number;
  failedCount?: number;
  totalTargeted?: number;
  sentAt: number;                     // epoch ms — injected by POST handler, not from client
}

// ─── Migration checklist ──────────────────────────────────────────────────────
//
// Firestore → MongoDB field mapping:
//
//  1. TIMESTAMPS: all fields above are epoch MILLISECONDS.
//     Firestore Timestamp.toMillis() → use as-is.
//     Firestore Timestamp.seconds → multiply by 1000.
//     Firestore Timestamp.toDate().getTime() → use as-is (already ms).
//
//  2. DOCUMENT IDs: discard Firestore doc IDs.
//     users        → keyed by uid (= Firebase Auth UID = Firestore doc ID for users/{uid})
//     subscriptions / google_play_purchases → keyed by purchaseToken
//     sync_history / notifications → new ObjectId per document
//
//  3. SUBCOLLECTIONS: if Firestore had users/{uid}/syncHistory → insert each as
//     a separate document in MongoDB `sync_history` with uid field.
//
//  4. PLAN/STATUS defaults: documents missing plan default to "free",
//     missing status default to "active" (matches $setOnInsert in sync route).
//
//  5. Create these indexes BEFORE inserting migration data:
//     db.users.createIndex({ uid: 1 }, { unique: true })
//     db.subscriptions.createIndex({ purchaseToken: 1 }, { unique: true })
//     db.google_play_purchases.createIndex({ purchaseToken: 1 }, { unique: true })
//     db.sync_history.createIndex({ uid: 1, timestamp: -1 })
//     db.notifications.createIndex({ sentAt: -1 })
