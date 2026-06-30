import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, unauthorized, serverError } from '@/lib/auth-server';
import { verifyAppleTransaction } from '@/lib/apple-appstore';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

/**
 * POST /api/iap/apple/verify
 *
 * Called by the Flutter iOS app immediately after a successful StoreKit purchase.
 *
 * Request body:
 * {
 *   uid:                   string  — Firebase UID (must match auth token)
 *   productId:             string  — e.g. "com.calley.cloudsync.yearly"
 *   signedTransactionInfo: string  — JWS from StoreKit Transaction.jsonRepresentation
 *   signedRenewalInfo?:    string  — JWS from StoreKit (optional, pass if available)
 * }
 *
 * Response:
 * {
 *   success:              true
 *   planKey:              "yearly" | "lifetime"
 *   resolvedPlanKey:      "yearly" | "lifetime" | "free"
 *   active:               boolean
 *   expiryAt:             number | null   (epoch ms)
 *   purchaseType:         "subscription" | "one_time"
 *   productId:            string
 *   originalTransactionId: string
 *   environment:          string
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const decoded = await verifyToken(req);
    const body = await req.json() as Record<string, unknown>;

    const uid =
      typeof body.uid === 'string' && body.uid.trim()
        ? body.uid.trim()
        : decoded.uid;

    if (uid !== decoded.uid) {
      return NextResponse.json(
        { error: 'Cannot verify a purchase for another user' },
        { status: 403 }
      );
    }

    const signedTransactionInfo =
      typeof body.signedTransactionInfo === 'string'
        ? body.signedTransactionInfo.trim()
        : '';

    if (!signedTransactionInfo) {
      return NextResponse.json(
        { error: 'signedTransactionInfo is required' },
        { status: 400 }
      );
    }

    const signedRenewalInfo =
      typeof body.signedRenewalInfo === 'string'
        ? body.signedRenewalInfo.trim() || undefined
        : undefined;

    const result = await verifyAppleTransaction({
      uid,
      signedTransactionInfo,
      signedRenewalInfo,
      source: 'client_verify',
    });

    logger.info('Apple IAP verified via client endpoint', {
      uid,
      planKey: result.planKey,
      resolvedPlanKey: result.resolvedPlanKey,
      active: result.active,
      environment: result.environment,
      originalTransactionId: result.originalTransactionId,
    });

    return NextResponse.json({
      success: true,
      planKey: result.planKey,
      resolvedPlanKey: result.resolvedPlanKey,
      active: result.active,
      expiryAt: result.expiryAt ?? null,
      purchaseType: result.purchaseType,
      productId: result.productId,
      originalTransactionId: result.originalTransactionId,
      environment: result.environment,
    });
  } catch (err) {
    logger.error('Apple IAP verification failed', {
      error: err instanceof Error ? err.message : 'Unknown error',
      stack: err instanceof Error ? err.stack?.split('\n').slice(0, 4).join(' | ') : undefined,
    });
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    return serverError(err);
  }
}
