import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, unauthorized, serverError } from '@/lib/auth-server';
import { verifyGooglePlayPurchase } from '@/lib/google-play';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const decoded = await verifyToken(req);
    const body = await req.json() as Record<string, unknown>;
    const uid = typeof body.uid === 'string' && body.uid.trim() ? body.uid.trim() : decoded.uid;
    if (uid !== decoded.uid) {
      return NextResponse.json({ error: 'Cannot verify a purchase for another user' }, { status: 403 });
    }

    const result = await verifyGooglePlayPurchase({
      uid,
      purchaseToken: String(body.purchaseToken || '').trim(),
      productId: typeof body.productId === 'string' ? body.productId.trim() : undefined,
      packageName: typeof body.packageName === 'string' ? body.packageName.trim() : undefined,
      planKey: typeof body.planKey === 'string' ? body.planKey.trim() : undefined,
      source: 'client_verify',
    });

    logger.info('Google Play purchase verified', {
      uid,
      purchaseTokenPrefix: result.purchaseToken.slice(0, 8),
      planKey: result.planKey,
      resolvedPlanKey: result.resolvedPlanKey,
      active: result.active,
    });

    return NextResponse.json({
      success: true,
      planKey: result.planKey,
      resolvedPlanKey: result.resolvedPlanKey,
      active: result.active,
      expiryAt: result.expiryAt || null,
      purchaseType: result.purchaseType,
      productId: result.productId,
    });
  } catch (err) {
    logger.error('Google Play verification failed', { error: err instanceof Error ? err.message : 'Unknown Error', stack: err instanceof Error ? err.stack?.split('\n').slice(0, 4).join(' | ') : undefined });
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    return serverError(err);
  }
}
