import { NextRequest, NextResponse } from 'next/server';
import { connectDb, serializeMongoData } from '@/lib/mongoose';
import { User } from '@/lib/models/User';
import { verifyToken, unauthorized, serverError } from '@/lib/auth-server';
import { normalizePlanKey } from '@/lib/constants';
import { logger } from '@/lib/logger';

type Params = { params: Promise<{ uid: string }> };

// GET /api/users/[uid]
export async function GET(req: NextRequest, { params }: Params) {
  try {
    await verifyToken(req);
    const { uid } = await params;
    await connectDb();
    logger.info('Fetching details for user', { uid });

    const doc = await User.findOne({ uid }).lean();
    if (!doc) {
      logger.warn('User lookup failed (Not Found)', { uid });
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    return NextResponse.json({ user: serializeMongoData(doc) });
  } catch (err) {
    logger.error('Error fetching user', { error: err instanceof Error ? err.message : 'Unknown Error' });
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    return serverError(err);
  }
}

// PATCH /api/users/[uid]
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await verifyToken(req);
    const { uid } = await params;
    const body = await req.json() as Record<string, unknown>;
    await connectDb();

    const allowed = [
      'email', 'name', 'loginProfile', 'activeSyncCloud', 'connectedProviders',
      'lastLogin', 'createdAt', 'mobile', 'pincode', 'address', 'city', 'state',
      'settings', 'deviceInfo', 'appInfo', 'syncData', 'fcmToken', 'plan', 'status',
    ] as const;

    const update: Record<string, unknown> = {};
    for (const key of allowed) {
      if (!(key in body)) continue;
      if (key === 'plan') update[key] = normalizePlanKey(String(body[key] || 'free'));
      else if (key === 'status') update[key] = String(body[key] || 'active').toLowerCase();
      else update[key] = body[key];
    }

    if (Object.keys(update).length === 0) {
      logger.warn('User update rejected: No valid fields', { uid });
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    await User.findOneAndUpdate({ uid }, { $set: update }, { upsert: true, new: true });
    logger.info('User successfully synced/updated', { uid, updatedFields: Object.keys(update) });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('Error updating user', { error: err instanceof Error ? err.message : 'Unknown Error' });
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    return serverError(err);
  }
}

// DELETE /api/users/[uid]
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    await verifyToken(req);
    const { uid } = await params;
    await connectDb();
    logger.info('Attempting to delete user', { uid });
    await User.deleteOne({ uid });
    logger.info('User successfully deleted', { uid });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('Error deleting user', { error: err instanceof Error ? err.message : 'Unknown Error' });
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    return serverError(err);
  }
}
