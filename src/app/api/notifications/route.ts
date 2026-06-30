import { NextRequest, NextResponse } from 'next/server';
import { connectDb, serializeMongoData } from '@/lib/mongoose';
import { Notification } from '@/lib/models/Notification';
import { verifyToken, unauthorized, serverError } from '@/lib/auth-server';
import { logger } from '@/lib/logger';

// GET /api/notifications — last 30 notifications ordered by sentAt desc
export async function GET(req: NextRequest) {
  try {
    await verifyToken(req);
    await connectDb();
    logger.info('Fetching latest global notifications', { limit: 30 });

    const docs = await Notification.find({}).sort({ sentAt: -1 }).limit(30).lean();
    const notifications = docs.map(serializeMongoData);
    logger.info('Global notifications fetched', { count: notifications.length });
    return NextResponse.json({ notifications });
  } catch (err) {
    logger.error('Error fetching global notifications', { error: err instanceof Error ? err.message : 'Unknown Error' });
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    return serverError(err);
  }
}

// POST /api/notifications — log a sent notification
export async function POST(req: NextRequest) {
  try {
    await verifyToken(req);
    const body = await req.json() as Record<string, unknown>;
    await connectDb();
    logger.info('Logging new notification', { title: body.title });

    const doc = await Notification.create({ ...body, sentAt: Date.now() });
    logger.info('Notification saved', { id: doc._id.toString() });
    return NextResponse.json({ success: true, id: doc._id.toString() });
  } catch (err) {
    logger.error('Error saving notification', { error: err instanceof Error ? err.message : 'Unknown Error' });
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    return serverError(err);
  }
}
