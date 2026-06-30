import { NextRequest, NextResponse } from 'next/server';
import { connectDb } from '@/lib/mongoose';
import { Notification } from '@/lib/models/Notification';
import { verifyToken, unauthorized, serverError } from '@/lib/auth-server';
import { logger } from '@/lib/logger';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    await verifyToken(req);
    const { id } = await params;
    await connectDb();
    await Notification.findByIdAndDelete(id);
    logger.info('Notification log deleted', { id });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('Error deleting notification log', { error: err instanceof Error ? err.message : 'Unknown Error' });
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    return serverError(err);
  }
}
