import { NextRequest, NextResponse } from 'next/server';
import {
  SignedDataVerifier,
  Environment,
  NotificationTypeV2,
  VerificationException,
} from '@apple/app-store-server-library';
import { processAppleNotification, getAppleRootCerts } from '@/lib/apple-appstore';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const BUNDLE_ID = process.env.APPLE_BUNDLE_ID || 'com.calley.cloudsync';
const APP_APPLE_ID = process.env.APPLE_APP_ID ? Number(process.env.APPLE_APP_ID) : undefined;

function getEnvironment(): Environment {
  return process.env.APPLE_ENVIRONMENT === 'production'
    ? Environment.PRODUCTION
    : Environment.SANDBOX;
}

// ---------------------------------------------------------------------------
// Notification types that carry no transaction data — safe to acknowledge
// without further processing
// ---------------------------------------------------------------------------
const IGNORABLE_TYPES = new Set<string>([
  NotificationTypeV2.TEST,
  NotificationTypeV2.RENEWAL_EXTENSION,
  NotificationTypeV2.PRICE_INCREASE,
  NotificationTypeV2.REFUND_DECLINED,
  NotificationTypeV2.CONSUMPTION_REQUEST,
  NotificationTypeV2.RENEWAL_EXTENDED,
  NotificationTypeV2.REFUND_REVERSED,
  NotificationTypeV2.EXTERNAL_PURCHASE_TOKEN,
  NotificationTypeV2.RESCIND_CONSENT,
  NotificationTypeV2.METADATA_UPDATE,
  NotificationTypeV2.PRICE_CHANGE,
  NotificationTypeV2.MIGRATION,
]);

// ---------------------------------------------------------------------------
// POST /api/webhooks/apple
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const signedPayload = typeof body.signedPayload === 'string' ? body.signedPayload.trim() : '';

    if (!signedPayload) {
      logger.warn('Apple webhook missing signedPayload');
      return NextResponse.json({ error: 'signedPayload is required' }, { status: 400 });
    }

    // Verify and decode the outer notification envelope
    const verifier = new SignedDataVerifier(
      getAppleRootCerts(),
      true,
      getEnvironment(),
      BUNDLE_ID,
      APP_APPLE_ID
    );

    let notification;
    try {
      notification = await verifier.verifyAndDecodeNotification(signedPayload);
    } catch (err) {
      const isVerificationError = err instanceof VerificationException;
      logger.error('Apple webhook signedPayload verification failed', {
        error: err instanceof Error ? err.message : 'unknown',
        isVerificationError,
        status: isVerificationError ? err.status : undefined,
      });
      // Return 400 so Apple does not retry a permanently invalid payload
      return NextResponse.json({ error: 'Invalid signedPayload' }, { status: 400 });
    }

    const { notificationType, subtype, notificationUUID } = notification;

    logger.info('Apple webhook received', {
      notificationType,
      subtype,
      notificationUUID,
      environment: notification.data?.environment,
    });

    // Acknowledge ignorable notification types immediately
    if (notificationType && IGNORABLE_TYPES.has(notificationType)) {
      logger.info('Apple webhook notification type ignored', { notificationType, subtype });
      return NextResponse.json({ success: true, ignored: true });
    }

    // Delegate to the core engine
    const result = await processAppleNotification({
      notification,
      source: 'apple_ssn',
    });

    if (!result) {
      logger.info('Apple webhook notification produced no actionable result', {
        notificationType,
        subtype,
      });
      return NextResponse.json({ success: true, ignored: true });
    }

    logger.info('Apple webhook processed', {
      uid: result.userId,
      planKey: result.planKey,
      resolvedPlanKey: result.resolvedPlanKey,
      active: result.active,
      status: result.status,
      originalTransactionId: result.originalTransactionId,
    });

    return NextResponse.json({
      success: true,
      planKey: result.planKey,
      resolvedPlanKey: result.resolvedPlanKey,
      active: result.active,
    });
  } catch (err) {
    logger.error('Apple webhook failed', {
      error: err instanceof Error ? err.message : 'Unknown error',
      stack: err instanceof Error ? err.stack?.split('\n').slice(0, 4).join(' | ') : undefined,
    });
    // Return 500 so Apple retries the notification
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
