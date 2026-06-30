import { NextRequest, NextResponse } from 'next/server';
import { connectDb, serializeMongoData } from '@/lib/mongoose';
import { User } from '@/lib/models/User';
import { verifyToken, unauthorized, serverError } from '@/lib/auth-server';
import { logger } from '@/lib/logger';

// GET /api/users — list all users ordered by lastLogin
export async function GET(req: NextRequest) {
  try {
    await verifyToken(req);
    await connectDb();
    logger.info('Fetching global user directory list');

    const docs = await User.find(
      {},
      'uid name displayName email mobile plan status fcmToken loginProfile activeSyncCloud connectedProviders lastLogin createdAt planExpiresAt uploadStats billing settings deviceInfo appInfo'
    ).sort({ lastLogin: -1 }).lean();

    const users = docs.map(doc => {
      const plain = serializeMongoData(doc);
      plain.settings = {
        autoSync: true,
        wifiOnly: true,
        downloadSync: true,
        folderPaths: [],
        ...(plain.settings ?? {}),
      };
      return plain;
    });

    logger.info('Global user directory fetch complete', { userCount: users.length });
    return NextResponse.json({ users });
  } catch (err) {
    logger.error('Error fetching users', { error: err instanceof Error ? err.message : 'Unknown Error' });
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    return serverError(err);
  }
}
