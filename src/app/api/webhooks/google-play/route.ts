import { NextRequest, NextResponse } from 'next/server';
import { syncGooglePlayPurchaseFromNotification } from '@/lib/google-play';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

function decodePubSubBody(body: Record<string, unknown>) {
  const message = body.message as { data?: string } | undefined;
  if (!message?.data) return body;
  const decoded = Buffer.from(message.data, 'base64').toString('utf8');
  try {
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return { raw: decoded };
  }
}

function extractNotification(body: Record<string, unknown>) {
  const payload = decodePubSubBody(body);
  if ('testNotification' in payload) {
    return { type: 'test' as const, payload };
  }
  if ('subscriptionNotification' in payload) {
    const notification = payload.subscriptionNotification as Record<string, unknown>;
    return {
      type: 'subscription' as const,
      payload,
      purchaseToken: typeof notification.purchaseToken === 'string' ? notification.purchaseToken : undefined,
      productId: typeof notification.subscriptionId === 'string' ? notification.subscriptionId : undefined,
      notificationType: notification.notificationType,
    };
  }
  if ('oneTimeProductNotification' in payload) {
    const notification = payload.oneTimeProductNotification as Record<string, unknown>;
    return {
      type: 'product' as const,
      payload,
      purchaseToken: typeof notification.purchaseToken === 'string' ? notification.purchaseToken : undefined,
      productId: typeof notification.sku === 'string' ? notification.sku : undefined,
      notificationType: notification.notificationType,
    };
  }
  const p = payload as Record<string, unknown>;
  return {
    type: 'direct' as const,
    payload,
    purchaseToken: typeof p.purchaseToken === 'string' ? p.purchaseToken : undefined,
    productId: typeof p.productId === 'string' ? p.productId : undefined,
    uid: typeof p.uid === 'string' ? p.uid : undefined,
    currencyCode: typeof p.currencyCode === 'string' ? p.currencyCode : undefined,
    formattedPrice: typeof p.formattedPrice === 'string' ? p.formattedPrice : undefined,
  };
}

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.GOOGLE_PLAY_WEBHOOK_SECRET;
    if (secret) {
      const supplied = req.headers.get('x-google-play-webhook-secret') || req.headers.get('x-webhook-secret') || req.nextUrl.searchParams.get('secret');
      if (supplied !== secret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await req.json() as Record<string, unknown>;
    const extracted = extractNotification(body);

    if (extracted.type === 'test') {
      logger.info('Google Play test notification received');
      return NextResponse.json({ success: true, ignored: true });
    }

    if (!extracted.purchaseToken) {
      logger.warn('Google Play webhook missing purchaseToken', { type: extracted.type, notificationType: 'notificationType' in extracted ? extracted.notificationType : undefined });
      return NextResponse.json({ error: 'purchaseToken missing from webhook payload' }, { status: 400 });
    }

    logger.info('Google Play webhook received', { type: extracted.type, notificationType: 'notificationType' in extracted ? extracted.notificationType : undefined, productId: extracted.productId, uid: 'uid' in extracted ? extracted.uid : undefined, purchaseTokenPrefix: extracted.purchaseToken.slice(0, 8) });

    const result = await syncGooglePlayPurchaseFromNotification({
      uid: extracted.uid,
      purchaseToken: extracted.purchaseToken,
      productId: extracted.productId,
      source: extracted.type === 'subscription' ? 'rtdn_subscription' : (extracted.type === 'product' ? 'rtdn_product' : 'webhook'),
      currencyCode: 'currencyCode' in extracted ? extracted.currencyCode : undefined,
      formattedPrice: 'formattedPrice' in extracted ? extracted.formattedPrice : undefined,
    });

    logger.info('Google Play webhook processed', {
      uid: result.userId,
      purchaseTokenPrefix: result.purchaseToken.slice(0, 8),
      planKey: result.planKey,
      resolvedPlanKey: result.resolvedPlanKey,
      active: result.active,
      orderId: result.orderId,
    });

    return NextResponse.json({
      success: true,
      planKey: result.planKey,
      resolvedPlanKey: result.resolvedPlanKey,
      active: result.active,
    });
  } catch (err) {
    logger.error('Google Play webhook failed', { error: err instanceof Error ? err.message : 'Unknown Error', stack: err instanceof Error ? err.stack?.split('\n').slice(0, 4).join(' | ') : undefined });
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 });
  }
}
