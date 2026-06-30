import { NextRequest, NextResponse } from 'next/server';
import { connectDb } from '@/lib/mongoose';
import { User } from '@/lib/models/User';
import { verifyToken, unauthorized, serverError } from '@/lib/auth-server';
import { logger } from '@/lib/logger';

type Params = { params: Promise<{ uid: string }> };

// PUT /api/users/[uid]/sync — full device sync upsert from Android app
// Merges all device-provided fields; never overwrites plan/status set by admin
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    await verifyToken(req);
    const { uid } = await params;
    const body = await req.json() as Record<string, unknown>;
    await connectDb();

    const now = Date.now();
    const set: Record<string, unknown> = { uid, lastLogin: now };

    const stringFields = ['email', 'name', 'loginProfile', 'activeSyncCloud', 'mobile',
      'pincode', 'address', 'city', 'state'] as const;
    for (const f of stringFields) {
      if (body[f] !== undefined && body[f] !== null) set[f] = body[f];
    }
    if (Array.isArray(body.connectedProviders)) set.connectedProviders = body.connectedProviders;
    if (body.fcmToken) set.fcmToken = body.fcmToken;
    if (body.settings && typeof body.settings === 'object') set.settings = body.settings;
    if (body.deviceInfo && typeof body.deviceInfo === 'object') set.deviceInfo = body.deviceInfo;
    if (body.appInfo && typeof body.appInfo === 'object') set.appInfo = body.appInfo;
    if (body.syncData && typeof body.syncData === 'object') set.syncData = body.syncData;

    const updated = await User.findOneAndUpdate(
      { uid },
      {
        $set: set,
        $setOnInsert: { createdAt: now, plan: 'free', status: 'active' },
      },
      { upsert: true, returnDocument: 'after' }
    );

    logger.info('User synced from device', { uid, plan: updated?.plan });
    return NextResponse.json({
      success: true,
      plan: updated?.plan ?? 'free',
      status: updated?.status ?? 'active',
    });
  } catch (err) {
    logger.error('Error syncing user', { error: err instanceof Error ? err.message : 'Unknown Error' });
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    return serverError(err);
  }
}
