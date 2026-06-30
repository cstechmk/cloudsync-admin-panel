import { NextRequest, NextResponse } from 'next/server';
import { connectDb } from '@/lib/mongoose';
import { User } from '@/lib/models/User';
import { verifyToken, unauthorized, serverError } from '@/lib/auth-server';
import { logger } from '@/lib/logger';

type Params = { params: Promise<{ uid: string }> };

// POST /api/users/[uid]/stats — atomic increment of upload stats
export async function POST(req: NextRequest, { params }: Params) {
  try {
    await verifyToken(req);
    const { uid } = await params;
    const { bytes, files } = await req.json();

    if (typeof bytes !== 'number' || typeof files !== 'number') {
      return NextResponse.json({ error: 'Invalid bytes or files' }, { status: 400 });
    }

    const now = Date.now();
    await connectDb();

    await User.findOneAndUpdate(
      { uid },
      {
        $inc: {
          'uploadStats.totalBytesUploaded': bytes,
          'uploadStats.totalFilesUploaded': files,
          'uploadStats.syncCount': 1,
        },
        $set: {
          'uploadStats.lastSyncBytes': bytes,
          'uploadStats.lastSyncTimestamp': now,
        },
      },
      { upsert: true }
    );

    logger.info('Upload stats updated', { uid, bytes, files });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('Error updating stats', { error: err instanceof Error ? err.message : 'Unknown Error' });
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    return serverError(err);
  }
}
