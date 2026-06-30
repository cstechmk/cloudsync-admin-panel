import { JWT } from 'google-auth-library';
import { serviceAccount } from '@/lib/firebase-admin';
import admin from 'firebase-admin';
import { connectDb } from '@/lib/mongoose';
import { GooglePlayPurchase } from '@/lib/models/GooglePlayPurchase';
import { User } from '@/lib/models/User';
import { Subscription } from '@/lib/models/Subscription';
import {
  getPlan,
  normalizePlanKey,
  resolvePlanFromProductId,
  canOverwritePlan,
  type PlanKey,
  type PurchaseType,
} from '@/lib/billing';
import { logger } from '@/lib/logger';

const ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const DEFAULT_PACKAGE_NAME = process.env.GOOGLE_PLAY_PACKAGE_NAME || '';
const GOOGLE_PLAY_BASE_URL = 'https://androidpublisher.googleapis.com/androidpublisher/v3';

export interface VerifyGooglePlayPurchaseInput {
  purchaseToken: string;
  uid?: string;
  packageName?: string;
  productId?: string;
  planKey?: string;
  source?: string;
  currencyCode?: string;
  formattedPrice?: string;
  priceAmountMicros?: string | number;
}

export interface GooglePlayEntitlement {
  planKey: PlanKey;
  purchaseType: PurchaseType;
  productId: string;
  purchaseToken: string;
  orderId?: string;
  status: 'active' | 'expired' | 'pending' | 'canceled' | 'revoked';
  expiryAt?: number;
  amount: number;
  currency: string;
  raw: Record<string, unknown>;
}

function coerceString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function coerceNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function parseDateField(value: unknown): number | undefined {
  const asNum = coerceNumber(value);
  if (asNum !== undefined) return asNum;
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value).getTime();
    if (!Number.isNaN(parsed)) return parsed;
  }
  return undefined;
}

function getJwtClient() {
  return new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: [ANDROID_PUBLISHER_SCOPE],
  });
}

async function getAccessToken() {
  const client = getJwtClient();
  const { access_token } = await client.authorize();
  if (!access_token) throw new Error('Unable to obtain Google Play access token');
  return access_token;
}

async function googlePlayFetch<T = unknown>(url: string): Promise<T> {
  const accessToken = await getAccessToken();
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    logger.error('Google Play API request failed', { status: res.status, url: url.replace(/tokens\/[^/]+/, 'tokens/[redacted]'), errorText: errorText.slice(0, 300) });
    throw new Error(`Google Play API ${res.status}: ${errorText || res.statusText}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Resolves actual charged amount + currency from Play API raw response.
 * subscriptionsv2 stores price in lineItems[0].offerDetails.priceMicros (micros of local currency).
 * products API stores it in priceAmountMicros + priceCurrencyCode at the root.
 * Falls back to client-supplied priceAmountMicros, then to billing.ts plan defaults.
 */
function resolveActualPrice(
  raw: Record<string, unknown>,
  lineItems: Record<string, unknown>[],
  input: VerifyGooglePlayPurchaseInput,
  planKey: PlanKey
): { amount: number; currency: string } {
  const plan = getPlan(planKey);

  // subscriptionsv2: lineItems[0].offerDetails.priceMicros + currencyCode
  const firstItem = lineItems[0] as Record<string, unknown> | undefined;
  const offerDetails = firstItem?.offerDetails as Record<string, unknown> | undefined;
  const subMicros = coerceNumber(offerDetails?.priceMicros);
  const subCurrency = coerceString(offerDetails?.priceCurrencyCode)
    || coerceString(raw.priceCurrencyCode);

  if (subMicros !== undefined && subMicros > 0 && subCurrency) {
    return { amount: subMicros / 1_000_000, currency: subCurrency.toUpperCase() };
  }

  // products API: root-level priceAmountMicros + priceCurrencyCode
  const rootMicros = coerceNumber(raw.priceAmountMicros);
  const rootCurrency = coerceString(raw.priceCurrencyCode);
  if (rootMicros !== undefined && rootMicros > 0 && rootCurrency) {
    return { amount: rootMicros / 1_000_000, currency: rootCurrency.toUpperCase() };
  }

  // client-supplied micros (Android app can pass this)
  const clientMicros = coerceNumber(input.priceAmountMicros);
  const clientCurrency = input.currencyCode?.toUpperCase();
  if (clientMicros !== undefined && clientMicros > 0 && clientCurrency) {
    return { amount: clientMicros / 1_000_000, currency: clientCurrency };
  }

  // fallback: plan defaults
  return {
    amount: plan.amount,
    currency: (input.currencyCode || plan.currency).toUpperCase(),
  };
}

function getConfiguredPlanKey(input: VerifyGooglePlayPurchaseInput, verifiedProductId?: string): PlanKey {
  const fromBody = input.planKey ? normalizePlanKey(input.planKey) : null;
  if (fromBody) return fromBody;
  const fromProduct = resolvePlanFromProductId(input.productId || verifiedProductId || undefined);
  if (fromProduct) return fromProduct;
  return 'yearly';
}

function mapSubscriptionStatus(rawStatus?: string): GooglePlayEntitlement['status'] {
  const status = (rawStatus || '').toUpperCase();
  if (!status) return 'pending';
  if (status.includes('ACTIVE') || status.includes('GRACE') || status.includes('HOLD') || status.includes('PAUSED')) {
    return 'active';
  }
  if (status.includes('CANCELED')) return 'canceled';
  if (status.includes('REVOKED')) return 'revoked';
  if (status.includes('EXPIRED')) return 'expired';
  return 'pending';
}

async function verifySubscriptionPurchase(input: VerifyGooglePlayPurchaseInput, packageName: string) {
  const purchaseToken = input.purchaseToken;
  logger.info('Verifying Google Play subscription', { uid: input.uid, productId: input.productId, purchaseTokenPrefix: purchaseToken.slice(0, 8), packageName });
  const url = `${GOOGLE_PLAY_BASE_URL}/applications/${packageName}/purchases/subscriptionsv2/tokens/${purchaseToken}`;
  const raw = await googlePlayFetch<Record<string, unknown>>(url);
  const lineItems = Array.isArray(raw.lineItems) ? raw.lineItems as Record<string, unknown>[] : [];
  const firstLineItem = lineItems[0] || {};
  const verifiedProductId = coerceString(firstLineItem.productId) || coerceString(raw.productId) || input.productId;
  const planKey = getConfiguredPlanKey(input, verifiedProductId);
  const expiryAt = parseDateField(firstLineItem.expiryTimeMillis)
    ?? parseDateField(firstLineItem.expiryTime)
    ?? parseDateField(raw.expiryTimeMillis)
    ?? parseDateField(raw.expiryTime);
  const state = mapSubscriptionStatus(coerceString(raw.subscriptionState));

  const { amount, currency } = resolveActualPrice(raw, lineItems, input, planKey);
  const entitlement: GooglePlayEntitlement = {
    planKey,
    purchaseType: 'subscription' as const,
    productId: verifiedProductId || input.productId || '',
    purchaseToken,
    orderId: coerceString(raw.latestOrderId) || coerceString(raw.orderId),
    status: state,
    expiryAt,
    amount,
    currency,
    raw,
  };
  logger.info('Google Play subscription verified', { uid: input.uid, productId: entitlement.productId, planKey: entitlement.planKey, status: entitlement.status, expiryAt: entitlement.expiryAt, orderId: entitlement.orderId, purchaseTokenPrefix: purchaseToken.slice(0, 8) });
  return entitlement;
}

async function verifyProductPurchase(input: VerifyGooglePlayPurchaseInput, packageName: string) {
  const purchaseToken = input.purchaseToken;
  const productId = input.productId;
  if (!productId) {
    logger.error('Google Play one-time purchase missing productId', { uid: input.uid, purchaseTokenPrefix: purchaseToken.slice(0, 8) });
    throw new Error('productId is required for one-time purchases');
  }
  logger.info('Verifying Google Play one-time product', { uid: input.uid, productId, purchaseTokenPrefix: purchaseToken.slice(0, 8), packageName });

  const url = `${GOOGLE_PLAY_BASE_URL}/applications/${packageName}/purchases/products/${productId}/tokens/${purchaseToken}`;
  const raw = await googlePlayFetch<Record<string, unknown>>(url);

  const purchaseState = coerceNumber(raw.purchaseState);
  let status: GooglePlayEntitlement['status'] = 'active';
  if (purchaseState === 1) status = 'revoked';
  if (purchaseState === 2) status = 'pending';

  const planKey = getConfiguredPlanKey(input, productId);

  const { amount, currency } = resolveActualPrice(raw, [], input, planKey);
  const entitlement: GooglePlayEntitlement = {
    planKey,
    purchaseType: 'one_time' as const,
    productId,
    purchaseToken,
    orderId: coerceString(raw.orderId),
    status,
    expiryAt: undefined,
    amount,
    currency,
    raw,
  };
  logger.info('Google Play one-time product verified', { uid: input.uid, productId, planKey: entitlement.planKey, status: entitlement.status, orderId: entitlement.orderId, purchaseTokenPrefix: purchaseToken.slice(0, 8) });
  return entitlement;
}

export async function verifyGooglePlayPurchase(input: VerifyGooglePlayPurchaseInput) {
  const packageName = input.packageName || DEFAULT_PACKAGE_NAME;
  if (!packageName) {
    logger.error('Google Play package name not configured', { uid: input.uid });
    throw new Error('GOOGLE_PLAY_PACKAGE_NAME is not configured');
  }
  if (!input.purchaseToken) {
    logger.error('Google Play purchase verification missing purchaseToken', { uid: input.uid, productId: input.productId });
    throw new Error('purchaseToken is required');
  }

  const planKey = normalizePlanKey(input.planKey);
  const inferredPlanKey = resolvePlanFromProductId(input.productId || undefined) || planKey;
  const plan = getPlan(inferredPlanKey);

  if (plan.billingKind === 'none' && inferredPlanKey !== 'free') {
    logger.error('Google Play invalid plan configuration', { uid: input.uid, productId: input.productId, inferredPlanKey });
    throw new Error('Invalid plan configuration');
  }

  logger.info('Google Play purchase verification started', { uid: input.uid, productId: input.productId, planKey: inferredPlanKey, billingKind: plan.billingKind, source: input.source, purchaseTokenPrefix: input.purchaseToken.slice(0, 8) });

  const entitlement = plan.billingKind === 'one_time'
    ? await verifyProductPurchase({ ...input, productId: input.productId || (plan.productIdEnv ? process.env[plan.productIdEnv] : undefined), planKey: inferredPlanKey }, packageName)
    : await verifySubscriptionPurchase({ ...input, planKey: inferredPlanKey }, packageName);

  const now = Date.now();
  const isLifetime = entitlement.planKey === 'lifetime';
  const isExpired = entitlement.expiryAt && entitlement.expiryAt <= now;

  const isActive = entitlement.status !== 'revoked' && (isLifetime
    ? true
    : (entitlement.status === 'active' || (entitlement.status === 'canceled' && !isExpired)));

  const resolvedPlanKey = isActive ? entitlement.planKey : 'free';
  const userId = input.uid?.trim();

  if (!isActive) {
    logger.warn('Google Play purchase inactive — downgrading to free', { uid: userId, status: entitlement.status, planKey: entitlement.planKey, isExpired: !!isExpired, expiryAt: entitlement.expiryAt, orderId: entitlement.orderId, purchaseTokenPrefix: entitlement.purchaseToken.slice(0, 8) });
  }

  await connectDb();

  logger.info('Saving Google Play purchase record', { uid: userId, planKey: entitlement.planKey, resolvedPlanKey, status: entitlement.status, purchaseTokenPrefix: entitlement.purchaseToken.slice(0, 8) });
  await GooglePlayPurchase.findOneAndUpdate(
    { purchaseToken: entitlement.purchaseToken },
    {
      $set: {
        uid: userId || null,
        planKey: entitlement.planKey,
        purchaseType: entitlement.purchaseType,
        purchaseToken: entitlement.purchaseToken,
        productId: entitlement.productId,
        orderId: entitlement.orderId || null,
        status: entitlement.status,
        activePlan: resolvedPlanKey,
        expiryAt: entitlement.expiryAt || null,
        packageName,
        source: input.source || 'direct',
        verifiedAt: now,
        lastSyncedAt: now,
        raw: entitlement.raw,
      },
    },
    { upsert: true, new: true }
  );

  if (userId) {
    // Read current plan before writing so we can guard against downgrades from webhooks
    const existingUser = await User.findOne({ uid: userId }, { plan: 1, fcmToken: 1 }).lean() as { plan?: string; fcmToken?: string } | null;
    const currentPlan = existingUser?.plan ?? 'free';
    const fcmToken = existingUser?.fcmToken;

    const source = input.source || 'direct';
    const planAllowed = canOverwritePlan(currentPlan, resolvedPlanKey as PlanKey, source);

    // If webhook tries to write a lower-tier plan (e.g. yearly renewal on a lifetime user), skip plan field update
    const effectivePlan = planAllowed ? resolvedPlanKey : currentPlan;

    if (!planAllowed) {
      logger.warn('Google Play webhook plan downgrade blocked — user has higher tier', {
        uid: userId,
        currentPlan,
        incomingPlan: resolvedPlanKey,
        source,
        purchaseTokenPrefix: entitlement.purchaseToken.slice(0, 8),
      });
    }

    logger.info('Updating user plan from Google Play purchase', { uid: userId, effectivePlan, resolvedPlanKey, previousPlanKey: currentPlan });
    await User.findOneAndUpdate(
      { uid: userId },
      {
        $set: {
          plan: effectivePlan,
          planExpiresAt: entitlement.expiryAt || null,
          billing: {
            provider: 'google_play',
            planKey: entitlement.planKey,
            purchaseType: entitlement.purchaseType,
            productId: entitlement.productId,
            purchaseToken: entitlement.purchaseToken,
            orderId: entitlement.orderId || null,
            status: entitlement.status,
            expiryAt: entitlement.expiryAt || null,
            verifiedAt: now,
            lastSyncedAt: now,
          },
        },
      },
      { upsert: true, new: true }
    );

    // Push realtime plan update to device via FCM data message if plan actually changed
    if (fcmToken && effectivePlan !== currentPlan) {
      try {
        await admin.messaging().send({
          token: fcmToken,
          data: {
            type: 'plan_updated',
            plan: effectivePlan,
            source,
          },
          android: { priority: 'high' },
        });
        logger.info('FCM plan_updated sent', { uid: userId, effectivePlan, fcmToken: fcmToken.slice(0, 10) });
      } catch (fcmErr) {
        logger.warn('FCM plan_updated send failed (non-fatal)', { uid: userId, error: fcmErr instanceof Error ? fcmErr.message : 'unknown' });
      }
    }

    const userData = await User.findOne({ uid: userId }).lean() as any || {};
    const existingSub = await Subscription.findOne({ purchaseToken: entitlement.purchaseToken }).lean() as any;

    const isNewPayment = !existingSub?.lastPaymentDate ||
      (entitlement.orderId && existingSub?.orderId && entitlement.orderId !== existingSub.orderId);

    logger.info('Upserting subscription record', { uid: userId, planType: entitlement.planKey, isNewPayment, orderId: entitlement.orderId, purchaseTokenPrefix: entitlement.purchaseToken.slice(0, 8) });
    await Subscription.findOneAndUpdate(
      { purchaseToken: entitlement.purchaseToken },
      {
        $set: {
          userId,
          purchaseToken: entitlement.purchaseToken,
          userName: (userData.displayName || userData.name || 'User ' + userId.slice(-4)).trim(),
          userEmail: userData.email || 'N/A',
          planType: entitlement.planKey,
          status: entitlement.status,
          startDate: existingSub?.startDate || now,
          renewalDate: entitlement.planKey === 'lifetime' ? null : (entitlement.expiryAt || null),
          nextBillingDate: entitlement.planKey === 'lifetime' ? null : (entitlement.expiryAt || null),
          lastPaymentDate: isNewPayment ? now : existingSub?.lastPaymentDate,
          orderId: entitlement.orderId || null,
          paymentMethod: 'google_play',
          amount: entitlement.amount,
          currency: entitlement.currency,
          formattedPrice: input.formattedPrice || getPlan(entitlement.planKey).price,
          autoRenew: entitlement.planKey === 'lifetime' ? false : (entitlement.status !== 'canceled' && entitlement.status !== 'revoked'),
          billingCycle: entitlement.planKey === 'yearly' ? 'yearly' : (entitlement.planKey === 'lifetime' ? 'lifetime' : 'monthly'),
          notificationsSent: existingSub?.notificationsSent || 0,
          updatedAt: now,
        },
      },
      { upsert: true, new: true }
    );
  }

  logger.info('Google Play purchase verification complete', { uid: userId, planKey: entitlement.planKey, resolvedPlanKey, active: isActive, purchaseType: entitlement.purchaseType, orderId: entitlement.orderId, purchaseTokenPrefix: entitlement.purchaseToken.slice(0, 8) });
  return {
    ...entitlement,
    resolvedPlanKey,
    active: isActive,
    userId,
  };
}

export async function syncGooglePlayPurchaseFromNotification(input: VerifyGooglePlayPurchaseInput) {
  await connectDb();
  const existing = await GooglePlayPurchase.findOne({ purchaseToken: input.purchaseToken }).lean() as any;
  const uid = input.uid || coerceString(existing?.uid);
  return verifyGooglePlayPurchase({
    ...input,
    uid,
    productId: input.productId || coerceString(existing?.productId),
    planKey: input.planKey || coerceString(existing?.planKey),
  });
}

export async function cancelGooglePlaySubscription(purchaseToken: string) {
  await connectDb();
  const purchase = await GooglePlayPurchase.findOne({ purchaseToken }).lean() as any;
  if (!purchase) throw new Error('Purchase record not found for this token');

  const { packageName, productId } = purchase;
  if (!packageName || !productId) throw new Error('Missing packageName or productId in purchase record');
  if (purchase.purchaseType === 'one_time') throw new Error('One-time purchases cannot be canceled, only refunded');

  const accessToken = await getAccessToken();
  const url = `${GOOGLE_PLAY_BASE_URL}/applications/${packageName}/purchases/subscriptions/${productId}/tokens/${purchaseToken}:cancel`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Google Play API Cancel ${res.status}: ${errorText || res.statusText}`);
  }
}

export async function refundGooglePlayProduct(purchaseToken: string) {
  await connectDb();
  const purchase = await GooglePlayPurchase.findOne({ purchaseToken }).lean() as any;
  if (!purchase) throw new Error('Purchase record not found for this token');

  const { packageName, productId } = purchase;
  if (!packageName || !productId) throw new Error('Missing packageName or productId in purchase record');

  const accessToken = await getAccessToken();
  const url = `${GOOGLE_PLAY_BASE_URL}/applications/${packageName}/purchases/products/${productId}/tokens/${purchaseToken}:refund`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Google Play API Product Refund ${res.status}: ${errorText || res.statusText}`);
  }
}

export async function refundAndRevokeGooglePlaySubscription(purchaseToken: string) {
  await connectDb();
  const purchase = await GooglePlayPurchase.findOne({ purchaseToken }).lean() as any;
  if (!purchase) throw new Error('Purchase record not found for this token');

  const { packageName, productId } = purchase;
  const isProduct = purchase.purchaseType === 'one_time';

  if (!packageName || !productId) throw new Error('Missing packageName or productId in purchase record');

  if (isProduct) {
    return refundGooglePlayProduct(purchaseToken);
  }

  const accessToken = await getAccessToken();
  const url = `${GOOGLE_PLAY_BASE_URL}/applications/${packageName}/purchases/subscriptions/${productId}/tokens/${purchaseToken}:revoke`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Google Play API Revoke ${res.status}: ${errorText || res.statusText}`);
  }
}
