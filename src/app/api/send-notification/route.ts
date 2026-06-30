import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, unauthorized, serverError } from '@/lib/auth-server';
import '@/lib/firebase-admin'; // ensures admin is initialized
import admin from 'firebase-admin';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    await verifyToken(req);

    const { token, title, body, imageUrl, url, notificationType = 'text' } =
      await req.json() as {
        token: string; title: string; body: string;
        imageUrl?: string; url?: string; notificationType?: string;
      };

    if (!token || !title || !body) {
      logger.warn('Send Notification attempt failed: Missing fields', { hasToken: !!token, title });
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const message: admin.messaging.Message = {
      token,
      notification: {
        title,
        body,
        ...(imageUrl ? { imageUrl } : {}),
      },
      data: {
        type: 'admin_push',
        notificationType,
        title,
        body,
        ...(imageUrl ? { imageUrl } : {}),
        ...(url ? { url } : {}),
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'cloudsync_push',
          ...(imageUrl ? { imageUrl } : {}),
        },
      },
    };

    const response = await admin.messaging().send(message);
    logger.info('Firebase push notification dispatched successfully', { tokenPrefix: token.slice(0, 10), messageId: response, title });
    
    return NextResponse.json({ success: true, messageId: response });
  } catch (err) {
    logger.error('Error sending Firebase push notification', { error: err instanceof Error ? err.message : 'Unknown Error' });
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    return serverError(err);
  }
}
