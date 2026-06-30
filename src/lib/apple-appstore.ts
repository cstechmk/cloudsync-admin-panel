import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import {
  SignedDataVerifier,
  AppStoreServerAPIClient,
  Environment,
  NotificationTypeV2,
  Subtype,
  type JWSTransactionDecodedPayload,
  type JWSRenewalInfoDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from '@apple/app-store-server-library';
import { connectDb } from '@/lib/mongoose';
import { AppStorePurchase } from '@/lib/models/AppStorePurchase';
import { User } from '@/lib/models/User';
import { Subscription } from '@/lib/models/Subscription';
import {
  getPlan,
  resolvePlanFromProductId,
  canOverwritePlan,
  type PlanKey,
  type PurchaseType,
} from '@/lib/billing';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BUNDLE_ID = process.env.APPLE_BUNDLE_ID || 'com.calley.cloudsync';
const APP_APPLE_ID = process.env.APPLE_APP_ID ? Number(process.env.APPLE_APP_ID) : undefined;

function getEnvironment(): Environment {
  return process.env.APPLE_ENVIRONMENT === 'production'
    ? Environment.PRODUCTION
    : Environment.SANDBOX;
}

// ---------------------------------------------------------------------------
// Apple Root CA loader
//
// SignedDataVerifier requires DER-encoded Apple root certificates as Buffer[].
// Certificates are loaded from files in the certs/ directory at the project root.
//
// One-time setup — download the certs from Apple:
//   cd certs/
//   curl -O https://www.apple.com/appleca/AppleRootCA-G3.cer
//   curl -O https://www.apple.com/appleca/AppleRootCA-G2.cer
//   curl -O https://www.apple.com/appleca/AppleRootCA.cer
// ---------------------------------------------------------------------------

const CERTS_DIR = path.join(process.cwd(), 'certs');

const APPLE_ROOT_CERT_FILES: Array<{ file: string; label: string; required: boolean }> = [
  { file: 'AppleRootCA-G3.cer', label: 'Apple Root CA G3', required: true },
  { file: 'AppleRootCA-G2.cer', label: 'Apple Root CA G2', required: false },
  { file: 'AppleRootCA.cer',    label: 'Apple Root CA',    required: false },
];

export function getAppleRootCerts(): Buffer[] {
  const certs: Buffer[] = [];

  for (const { file, label, required } of APPLE_ROOT_CERT_FILES) {
    const certPath = path.join(CERTS_DIR, file);
    try {
      certs.push(fs.readFileSync(certPath));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (required) {
        logger.error(`Required Apple root certificate missing: ${label}`, { path: certPath, error: message });
        throw new Error(
          `Required Apple root certificate not found at ${certPath}. ` +
          `Download it: curl -O https://www.apple.com/appleca/${file}`
        );
      } else {
        logger.warn(`Optional Apple root certificate not found: ${label} (skipping)`, { path: certPath });
      }
    }
  }

  return certs;
}

function getVerifier(): SignedDataVerifier {
  return new SignedDataVerifier(
    getAppleRootCerts(),
    true, // enableOnlineChecks (OCSP revocation)
    getEnvironment(),
    BUNDLE_ID,
    APP_APPLE_ID
  );
}

// ---------------------------------------------------------------------------
// App Store Server API client (used for server-side transaction lookup)
// ---------------------------------------------------------------------------

function loadSigningKey(keyId: string): string {
  const certsDir = path.join(process.cwd(), 'certs');
  // Match any *_<keyId>.p8 file (AuthKey_, SubscriptionKey_, etc.)
  try {
    const match = fs.readdirSync(certsDir).find(f => f.endsWith(`_${keyId}.p8`));
    if (match) return fs.readFileSync(path.join(certsDir, match), 'utf8');
  } catch {
    // certs dir missing — fall through to env var
  }
  const fromEnv = process.env.APPLE_SIGNING_KEY_P8;
  if (fromEnv) return fromEnv;
  throw new Error(
    `Apple signing key not found: expected certs/*_${keyId}.p8 or APPLE_SIGNING_KEY_P8 env var`
  );
}

function getApiClient(): AppStoreServerAPIClient {
  const keyId = process.env.APPLE_KEY_ID;
  const issuerId = process.env.APPLE_ISSUER_ID;

  if (!keyId || !issuerId) {
    throw new Error(
      'Apple App Store API credentials not configured (APPLE_KEY_ID, APPLE_ISSUER_ID)'
    );
  }

  const signingKey = loadSigningKey(keyId);

  return new AppStoreServerAPIClient(
    signingKey,
    keyId,
    issuerId,
    BUNDLE_ID,
    getEnvironment()
  );
}

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface VerifyAppleTransactionInput {
  /** Firebase UID of the purchasing user */
  uid?: string;
  /** Raw JWS signedTransactionInfo from StoreKit / App Store Server */
  signedTransactionInfo: string;
  /** Optional: signedRenewalInfo from StoreKit (pass if available) */
  signedRenewalInfo?: string;
  /** Source of this verification call */
  source?: string;
}

export interface ProcessAppleNotificationInput {
  /** Decoded notification payload (already verified by the webhook handler) */
  notification: ResponseBodyV2DecodedPayload;
  /** Source label for audit trail */
  source?: string;
}

export interface AppleEntitlement {
  planKey: PlanKey;
  purchaseType: PurchaseType;
  productId: string;
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  status: 'active' | 'expired' | 'pending' | 'canceled' | 'revoked';
  environment: string;
  expiryAt?: number;
  purchaseDate?: number;
  revocationDate?: number;
  amount: number;
  currency: string;
  raw: JWSTransactionDecodedPayload;
}

// ---------------------------------------------------------------------------
// Notification type → status mapping
// ---------------------------------------------------------------------------

/**
 * Maps an Apple notification type + subtype pair to our internal subscription
 * status.  The mapping mirrors what Google Play's RTDN handler does:
 *
 * - SUBSCRIBED / DID_RENEW / OFFER_REDEEMED   → 'active'
 * - DID_CHANGE_RENEWAL_STATUS AUTO_RENEW_OFF   → 'canceled' (still active until expiry)
 * - DID_FAIL_TO_RENEW                          → 'active'   (might be in grace period)
 * - EXPIRED / GRACE_PERIOD_EXPIRED             → 'expired'
 * - REFUND / REVOKE                            → 'revoked'
 * - ONE_TIME_CHARGE                            → 'active'
 */
export function mapAppleNotificationToStatus(
  notificationType?: string,
  subtype?: string
): AppleEntitlement['status'] {
  switch (notificationType) {
    case NotificationTypeV2.SUBSCRIBED:
    case NotificationTypeV2.DID_RENEW:
    case NotificationTypeV2.OFFER_REDEEMED:
    case NotificationTypeV2.ONE_TIME_CHARGE:
      return 'active';

    case NotificationTypeV2.DID_CHANGE_RENEWAL_STATUS:
      return subtype === Subtype.AUTO_RENEW_DISABLED ? 'canceled' : 'active';

    case NotificationTypeV2.DID_FAIL_TO_RENEW:
      // Still in billing retry / grace period — keep 'active' until EXPIRED fires
      return 'active';

    case NotificationTypeV2.EXPIRED:
    case NotificationTypeV2.GRACE_PERIOD_EXPIRED:
      return 'expired';

    case NotificationTypeV2.REFUND:
    case NotificationTypeV2.REVOKE:
      return 'revoked';

    default:
      return 'pending';
  }
}

// ---------------------------------------------------------------------------
// Price resolution
// ---------------------------------------------------------------------------

function resolvePrice(
  tx: JWSTransactionDecodedPayload,
  planKey: PlanKey
): { amount: number; currency: string } {
  const plan = getPlan(planKey);
  // Apple price is in milliunits (1/1000 of currency unit); currency is ISO 4217
  if (typeof tx.price === 'number' && tx.price > 0 && tx.currency) {
    return { amount: tx.price / 1000, currency: tx.currency.toUpperCase() };
  }
  return { amount: plan.amount, currency: plan.currency };
}

// ---------------------------------------------------------------------------
// Core: build entitlement from a decoded transaction
// ---------------------------------------------------------------------------

function buildEntitlement(
  tx: JWSTransactionDecodedPayload,
  statusOverride?: AppleEntitlement['status']
): AppleEntitlement {
  const productId = tx.productId || '';
  const planKey = resolvePlanFromProductId(productId) || 'yearly';
  const plan = getPlan(planKey);
  const purchaseType: PurchaseType = plan.billingKind === 'one_time' ? 'one_time' : 'subscription';

  const { amount, currency } = resolvePrice(tx, planKey);

  const status: AppleEntitlement['status'] =
    statusOverride ??
    (tx.revocationDate
      ? 'revoked'
      : tx.expiresDate && tx.expiresDate <= Date.now()
        ? 'expired'
        : 'active');

  return {
    planKey,
    purchaseType,
    productId,
    transactionId: tx.transactionId || '',
    originalTransactionId: tx.originalTransactionId || tx.transactionId || '',
    bundleId: tx.bundleId || BUNDLE_ID,
    status,
    environment: tx.environment || getEnvironment(),
    expiryAt: tx.expiresDate,
    purchaseDate: tx.purchaseDate,
    revocationDate: tx.revocationDate,
    amount,
    currency,
    raw: tx,
  };
}

// ---------------------------------------------------------------------------
// Determine if an entitlement grants active access
// ---------------------------------------------------------------------------

function computeIsActive(entitlement: AppleEntitlement): boolean {
  if (entitlement.status === 'revoked') return false;
  if (entitlement.planKey === 'lifetime') return true;
  const isExpired = entitlement.expiryAt ? entitlement.expiryAt <= Date.now() : false;
  return (
    entitlement.status === 'active' ||
    (entitlement.status === 'canceled' && !isExpired)
  );
}

// ---------------------------------------------------------------------------
// Ownership transfer: one Apple subscription → one user at a time
//
// Called when a verified originalTransactionId is already recorded under a
// different Firebase UID.  The previous owner is demoted to 'free' before the
// new owner's records are written.  This prevents the cross-account
// subscription-link flaw where two users share the same physical Apple ID.
// ---------------------------------------------------------------------------

async function transferSubscriptionOwnership({
  originalTransactionId,
  previousUserId,
  newUserId,
  source,
}: {
  originalTransactionId: string;
  previousUserId: string;
  newUserId: string;
  source: string;
}): Promise<void> {
  logger.warn('Apple subscription ownership transfer initiated', {
    originalTransactionId,
    previousUserId,
    newUserId,
    source,
  });

  // Demote the previous owner: strip their paid plan and mark billing as transferred.
  // We do NOT delete their user record — they can still log in but as a free user.
  const previousUserDoc = await User.findOneAndUpdate(
    { uid: previousUserId },
    {
      $set: {
        plan: 'free',
        planExpiresAt: null,
        'billing.status': 'transferred',
        'billing.planKey': 'free',
        'billing.purchaseToken': null,
        'billing.expiryAt': null,
      },
    },
    { new: true }
  ).lean() as { fcmToken?: string } | null;

  // Re-point the Subscription record (purchaseToken = originalTransactionId for Apple)
  // to the new owner so admin-panel queries remain consistent.
  await Subscription.findOneAndUpdate(
    { purchaseToken: originalTransactionId },
    { $set: { userId: newUserId } }
  );

  // Best-effort FCM push so the previous owner's app reflects the plan change immediately.
  if (previousUserDoc?.fcmToken) {
    try {
      await admin.messaging().send({
        token: previousUserDoc.fcmToken,
        data: { type: 'plan_updated', plan: 'free', source: 'subscription_transferred' },
        apns: {
          payload: { aps: { contentAvailable: true } },
          headers: { 'apns-priority': '5' },
        },
      });
      logger.info('FCM plan_updated sent to demoted previous owner', {
        previousUserId,
        fcmTokenPrefix: previousUserDoc.fcmToken.slice(0, 10),
      });
    } catch (fcmErr) {
      logger.warn('FCM notification to demoted owner failed (non-fatal)', {
        previousUserId,
        error: fcmErr instanceof Error ? fcmErr.message : 'unknown',
      });
    }
  }

  logger.info('Apple subscription ownership transfer complete', {
    originalTransactionId,
    previousUserId,
    newUserId,
  });
}

// ---------------------------------------------------------------------------
// Shared persistence: write AppStorePurchase + User + Subscription
// ---------------------------------------------------------------------------

async function persistEntitlement(
  entitlement: AppleEntitlement,
  userId: string | undefined,
  source: string,
  renewalInfo?: JWSRenewalInfoDecodedPayload
): Promise<{ resolvedPlanKey: PlanKey; active: boolean }> {
  const now = Date.now();
  const isActive = computeIsActive(entitlement);
  const resolvedPlanKey: PlanKey = isActive ? entitlement.planKey : 'free';

  if (!isActive) {
    logger.warn('Apple purchase inactive — downgrading to free', {
      uid: userId,
      status: entitlement.status,
      planKey: entitlement.planKey,
      expiryAt: entitlement.expiryAt,
      revocationDate: entitlement.revocationDate,
      transactionIdPrefix: entitlement.transactionId.slice(0, 8),
    });
  }

  // 0. Ownership takeover check — runs only on authenticated client calls that
  //    carry a known userId (verify, restore).  Webhook calls arrive without a
  //    uid and preserve the existing owner, so they are never routed here.
  //
  //    If this originalTransactionId is already claimed by a DIFFERENT user we
  //    must demote that user before writing the new owner's records.  Skipping
  //    this step would leave two users believing they share one subscription.
  if (userId) {
    const existingClaim = await AppStorePurchase.findOne(
      { originalTransactionId: entitlement.originalTransactionId },
      { uid: 1 }
    ).lean() as { uid?: string } | null;

    const previousOwner = existingClaim?.uid as string | undefined;

    if (previousOwner && previousOwner !== userId) {
      await transferSubscriptionOwnership({
        originalTransactionId: entitlement.originalTransactionId,
        previousUserId: previousOwner,
        newUserId: userId,
        source,
      });
    }
  }

  // 1. Upsert AppStorePurchase (keyed by originalTransactionId)
  logger.info('Saving Apple App Store purchase record', {
    uid: userId,
    planKey: entitlement.planKey,
    resolvedPlanKey,
    status: entitlement.status,
    originalTransactionId: entitlement.originalTransactionId,
    transactionIdPrefix: entitlement.transactionId.slice(0, 8),
  });
  await AppStorePurchase.findOneAndUpdate(
    { originalTransactionId: entitlement.originalTransactionId },
    {
      $set: {
        originalTransactionId: entitlement.originalTransactionId,
        transactionId: entitlement.transactionId,
        uid: userId || null,
        planKey: entitlement.planKey,
        purchaseType: entitlement.purchaseType,
        productId: entitlement.productId,
        bundleId: entitlement.bundleId,
        status: entitlement.status,
        activePlan: resolvedPlanKey,
        environment: entitlement.environment,
        expiryAt: entitlement.expiryAt || null,
        purchaseDate: entitlement.purchaseDate || null,
        revocationDate: entitlement.revocationDate || null,
        source,
        verifiedAt: now,
        lastSyncedAt: now,
        raw: { transaction: entitlement.raw, renewalInfo: renewalInfo ?? null },
      },
    },
    { upsert: true, new: true }
  );

  if (!userId) return { resolvedPlanKey, active: isActive };

  // 2. Read current user plan to guard against webhook downgrades
  const existingUser = await User.findOne({ uid: userId }, { plan: 1, fcmToken: 1 }).lean() as
    | { plan?: string; fcmToken?: string }
    | null;
  const currentPlan = existingUser?.plan ?? 'free';
  const fcmToken = existingUser?.fcmToken;

  const planAllowed = canOverwritePlan(currentPlan, resolvedPlanKey, source);
  const effectivePlan = planAllowed ? resolvedPlanKey : currentPlan;

  if (!planAllowed) {
    logger.warn('Apple webhook plan downgrade blocked — user has higher tier', {
      uid: userId,
      currentPlan,
      incomingPlan: resolvedPlanKey,
      source,
      originalTransactionId: entitlement.originalTransactionId,
    });
  }

  // 3. Update User record
  logger.info('Updating user plan from Apple purchase', {
    uid: userId,
    effectivePlan,
    resolvedPlanKey,
    previousPlanKey: currentPlan,
  });
  await User.findOneAndUpdate(
    { uid: userId },
    {
      $set: {
        plan: effectivePlan,
        planExpiresAt: entitlement.expiryAt || null,
        billing: {
          provider: 'apple',
          planKey: entitlement.planKey,
          purchaseType: entitlement.purchaseType,
          productId: entitlement.productId,
          // Store originalTransactionId in purchaseToken slot (stable subscription key)
          purchaseToken: entitlement.originalTransactionId,
          orderId: entitlement.transactionId,
          status: entitlement.status,
          expiryAt: entitlement.expiryAt || null,
          verifiedAt: now,
          lastSyncedAt: now,
        },
      },
    },
    { upsert: true, new: true }
  );

  // 4. Push FCM realtime update if plan changed
  if (fcmToken && effectivePlan !== currentPlan) {
    try {
      await admin.messaging().send({
        token: fcmToken,
        data: { type: 'plan_updated', plan: effectivePlan, source },
        apns: { payload: { aps: { contentAvailable: true } }, headers: { 'apns-priority': '5' } },
      });
      logger.info('FCM plan_updated sent', { uid: userId, effectivePlan, fcmToken: fcmToken.slice(0, 10) });
    } catch (fcmErr) {
      logger.warn('FCM plan_updated send failed (non-fatal)', {
        uid: userId,
        error: fcmErr instanceof Error ? fcmErr.message : 'unknown',
      });
    }
  }

  // 5. Upsert Subscription record (purchaseToken = originalTransactionId)
  const userData = (await User.findOne({ uid: userId }).lean()) as Record<string, unknown> | null || {};
  const existingSub = (await Subscription.findOne({
    purchaseToken: entitlement.originalTransactionId,
  }).lean()) as Record<string, unknown> | null;

  const isNewPayment =
    !existingSub?.lastPaymentDate ||
    (entitlement.transactionId &&
      existingSub?.orderId &&
      entitlement.transactionId !== existingSub.orderId);

  const autoRenewStatus = renewalInfo?.autoRenewStatus;
  const autoRenew =
    entitlement.planKey === 'lifetime'
      ? false
      : entitlement.status !== 'canceled' &&
        entitlement.status !== 'revoked' &&
        entitlement.status !== 'expired' &&
        autoRenewStatus !== 0;

  logger.info('Upserting Apple subscription record', {
    uid: userId,
    planType: entitlement.planKey,
    isNewPayment,
    transactionId: entitlement.transactionId,
    originalTransactionId: entitlement.originalTransactionId,
  });

  await Subscription.findOneAndUpdate(
    { purchaseToken: entitlement.originalTransactionId },
    {
      $set: {
        userId,
        purchaseToken: entitlement.originalTransactionId,
        originalTransactionId: entitlement.originalTransactionId,
        userName: (
          (userData.displayName as string) ||
          (userData.name as string) ||
          'User ' + userId.slice(-4)
        ).trim(),
        userEmail: (userData.email as string) || 'N/A',
        planType: entitlement.planKey,
        status: entitlement.status,
        startDate: existingSub?.startDate || now,
        renewalDate: entitlement.planKey === 'lifetime' ? null : (entitlement.expiryAt || null),
        nextBillingDate: entitlement.planKey === 'lifetime' ? null : (entitlement.expiryAt || null),
        lastPaymentDate: isNewPayment ? now : existingSub?.lastPaymentDate,
        orderId: entitlement.transactionId,
        paymentMethod: 'apple',
        amount: entitlement.amount,
        currency: entitlement.currency,
        formattedPrice: getPlan(entitlement.planKey).price,
        autoRenew,
        billingCycle:
          entitlement.planKey === 'yearly'
            ? 'yearly'
            : entitlement.planKey === 'lifetime'
              ? 'lifetime'
              : 'monthly',
        notificationsSent: (existingSub?.notificationsSent as number) || 0,
        updatedAt: now,
      },
    },
    { upsert: true, new: true }
  );

  return { resolvedPlanKey, active: isActive };
}

// ---------------------------------------------------------------------------
// Public: verify a transaction from the Flutter client
// ---------------------------------------------------------------------------

export async function verifyAppleTransaction(input: VerifyAppleTransactionInput) {
  if (!input.signedTransactionInfo?.trim()) {
    throw new Error('signedTransactionInfo is required');
  }

  const txPrefix = input.signedTransactionInfo.slice(0, 12);
  logger.info('Apple App Store transaction verification started', {
    uid: input.uid,
    source: input.source,
    txPrefix,
  });

  const verifier = getVerifier();

  let tx: JWSTransactionDecodedPayload;
  try {
    tx = await verifier.verifyAndDecodeTransaction(input.signedTransactionInfo);
  } catch (err) {
    logger.error('Apple transaction JWS verification failed', {
      uid: input.uid,
      error: err instanceof Error ? err.message : 'unknown',
      txPrefix,
    });
    throw new Error(`Apple transaction verification failed: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  let renewalInfo: JWSRenewalInfoDecodedPayload | undefined;
  if (input.signedRenewalInfo) {
    try {
      renewalInfo = await verifier.verifyAndDecodeRenewalInfo(input.signedRenewalInfo);
    } catch (err) {
      logger.warn('Apple renewal info JWS verification failed (non-fatal)', {
        uid: input.uid,
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  const entitlement = buildEntitlement(tx);
  logger.info('Apple transaction decoded', {
    uid: input.uid,
    productId: entitlement.productId,
    planKey: entitlement.planKey,
    status: entitlement.status,
    environment: entitlement.environment,
    originalTransactionId: entitlement.originalTransactionId,
    transactionIdPrefix: entitlement.transactionId.slice(0, 8),
  });

  // Always call persistEntitlement for client-initiated verify (purchase or restore).
  // The user explicitly triggered this action, so we must always update the DB to
  // ensure the correct plan is reflected — even if we've seen this transaction before.
  // persistEntitlement uses upsert so it is safe to call multiple times.
  await connectDb();

  const { resolvedPlanKey, active } = await persistEntitlement(
    entitlement,
    input.uid?.trim(),
    input.source || 'client_verify',
    renewalInfo
  );

  logger.info('Apple App Store transaction verification complete', {
    uid: input.uid,
    planKey: entitlement.planKey,
    resolvedPlanKey,
    active,
    purchaseType: entitlement.purchaseType,
    environment: entitlement.environment,
    originalTransactionId: entitlement.originalTransactionId,
  });

  return { ...entitlement, resolvedPlanKey, active, userId: input.uid?.trim() };
}

// ---------------------------------------------------------------------------
// Public: process a server notification (called from the webhook handler)
// ---------------------------------------------------------------------------

export async function processAppleNotification(input: ProcessAppleNotificationInput) {
  const { notification, source = 'apple_ssn' } = input;
  const { notificationType, subtype, data } = notification;

  if (!data?.signedTransactionInfo) {
    logger.warn('Apple notification has no signedTransactionInfo — skipping', {
      notificationType,
      subtype,
    });
    return null;
  }

  const verifier = getVerifier();

  let tx: JWSTransactionDecodedPayload;
  try {
    tx = await verifier.verifyAndDecodeTransaction(data.signedTransactionInfo);
  } catch (err) {
    logger.error('Apple notification transaction decode failed', {
      notificationType,
      subtype,
      error: err instanceof Error ? err.message : 'unknown',
    });
    throw err;
  }

  let renewalInfo: JWSRenewalInfoDecodedPayload | undefined;
  if (data.signedRenewalInfo) {
    try {
      renewalInfo = await verifier.verifyAndDecodeRenewalInfo(data.signedRenewalInfo);
    } catch (err) {
      logger.warn('Apple notification renewal info decode failed (non-fatal)', {
        notificationType,
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  const statusOverride = mapAppleNotificationToStatus(notificationType, subtype);
  const entitlement = buildEntitlement(tx, statusOverride);

  logger.info('Apple notification decoded', {
    notificationType,
    subtype,
    productId: entitlement.productId,
    planKey: entitlement.planKey,
    status: entitlement.status,
    environment: entitlement.environment,
    originalTransactionId: entitlement.originalTransactionId,
    transactionIdPrefix: entitlement.transactionId.slice(0, 8),
  });

  await connectDb();

  // Apple SSN webhooks do not carry a user ID. Resolve uid by looking up the
  // existing AppStorePurchase record (written by the client-side verify call).
  // If this webhook fires before the client verify completes (race on first
  // purchase), uid will be undefined — persistEntitlement saves the transaction
  // record only, and the client verify will back-fill the uid when it runs.
  const existingRecord = await AppStorePurchase.findOne({
    originalTransactionId: entitlement.originalTransactionId,
  }).lean() as Record<string, unknown> | null;
  const uid = (existingRecord?.uid as string | null) || undefined;

  if (!uid) {
    logger.warn(
      'Apple webhook: uid not found for originalTransactionId — ' +
      'client verify has not yet run or was never called. ' +
      'The client verify will back-fill the uid when the app is next opened.',
      {
        originalTransactionId: entitlement.originalTransactionId,
        notificationType,
        subtype,
      }
    );
  }

  const { resolvedPlanKey, active } = await persistEntitlement(
    entitlement,
    uid,
    source,
    renewalInfo
  );

  return { ...entitlement, resolvedPlanKey, active, userId: uid ?? null };
}

// ---------------------------------------------------------------------------
// Public: look up a transaction by originalTransactionId via Apple's API
// (used for admin / server-initiated refresh)
// ---------------------------------------------------------------------------

export async function refreshAppleTransactionFromApi(originalTransactionId: string) {
  const client = getApiClient();
  const verifier = getVerifier();

  logger.info('Fetching Apple transaction info from API', { originalTransactionId });

  const response = await client.getTransactionInfo(originalTransactionId);
  const signedTransaction = response.signedTransactionInfo;
  if (!signedTransaction) throw new Error('No signedTransactionInfo in Apple API response');

  const tx = await verifier.verifyAndDecodeTransaction(signedTransaction);
  const entitlement = buildEntitlement(tx);

  await connectDb();

  const existingRecord = await AppStorePurchase.findOne({
    originalTransactionId: entitlement.originalTransactionId,
  }).lean() as Record<string, unknown> | null;
  const uid = (existingRecord?.uid as string | undefined) || undefined;

  const { resolvedPlanKey, active } = await persistEntitlement(entitlement, uid, 'api_refresh');

  return { ...entitlement, resolvedPlanKey, active, userId: uid };
}

// ---------------------------------------------------------------------------
// Re-export types for consumers
// ---------------------------------------------------------------------------
export type { JWSTransactionDecodedPayload, JWSRenewalInfoDecodedPayload, ResponseBodyV2DecodedPayload };
