import { NextRequest, NextResponse } from 'next/server';
import { connectDb, serializeMongoData } from '@/lib/mongoose';
import { SyncHistory } from '@/lib/models/SyncHistory';
import { verifyToken, unauthorized, serverError } from '@/lib/auth-server';
import { logger } from '@/lib/logger';

type Params = { params: Promise<{ uid: string }> };

// GET /api/users/[uid]/history — paginated sync history
export async function GET(req: NextRequest, { params }: Params) {
  try {
    await verifyToken(req);
    const { uid } = await params;
    const { searchParams } = new URL(req.url);
    const lastTimestamp = parseInt(searchParams.get('lastTimestamp') || '0');
    const limit = Math.min(parseInt(searchParams.get('limit') || '15'), 50);
    await connectDb();
    logger.info('Fetching sync history for user', { uid, lastTimestamp, limit });

    const query: Record<string, unknown> = { uid };
    if (lastTimestamp > 0) query.timestamp = { $lt: lastTimestamp };

    const docs = await SyncHistory.find(query).sort({ timestamp: -1 }).limit(limit).lean();
    const history = docs.map(serializeMongoData);
    logger.info('Sync history fetched', { uid, entryCount: history.length });
    return NextResponse.json({ history });
  } catch (err) {
    logger.error('Error fetching sync history', { error: err instanceof Error ? err.message : 'Unknown Error' });
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    return serverError(err);
  }
}

// POST /api/users/[uid]/history — add new sync history entry
export async function POST(req: NextRequest, { params }: Params) {
  try {
    await verifyToken(req);
    const { uid } = await params;
    const body = await req.json();
    await connectDb();

    await SyncHistory.create({
      uid,
      timestamp: body.timestamp || Date.now(),
      cloudProvider: body.cloudProvider || 'unknown',
      bytesPushed: body.bytesPushed || 0,
      filesPushed: body.filesPushed || 0,
      folderNames: body.folderNames || [],
      deviceModel: body.deviceModel || 'unknown',
    });

    logger.info('Sync history entry added', { uid });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('Error adding history', { error: err instanceof Error ? err.message : 'Unknown Error' });
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    return serverError(err);
  }
}

// DELETE /api/users/[uid]/history — wipe entire sync history for user
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    await verifyToken(req);
    const { uid } = await params;
    await connectDb();
    logger.info('Clearing sync history for user', { uid });

    const result = await SyncHistory.deleteMany({ uid });
    logger.info('Sync history cleared', { uid, deletedCount: result.deletedCount });
    return NextResponse.json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    logger.error('Error deleting sync history', { error: err instanceof Error ? err.message : 'Unknown Error' });
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    return serverError(err);
  }
}
