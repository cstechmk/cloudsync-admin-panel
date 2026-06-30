import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from './firebase-admin';
import { getSessionEmail, isAdminEmail } from './admin-session';
import { logger } from './logger';

/**
 * Verifies the OTP session cookie (primary admin auth).
 * Falls back to Firebase Bearer token for backwards-compatibility
 * during the transition period.
 */
export async function verifyToken(req: NextRequest) {
  const method = req.method;
  const path = req.nextUrl.pathname;

  // 1. Try OTP session cookie first
  const email = await getSessionEmail(req);
  if (email) {
    if (!isAdminEmail(email)) {
      logger.warn('Unauthorized: email not in admin list', { email, method, path });
      throw new Error('Unauthorized: Email not in admin list');
    }
    logger.info('Request authenticated via session cookie', { email, method, path });
    return { email, uid: email };
  }

  // 2. Fall back to Firebase Bearer token
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    logger.warn('Unauthorized: no token provided', { method, path });
    throw new Error('Unauthorized: No token provided');
  }
  const token = authHeader.slice(7);
  const decoded = await adminAuth.verifyIdToken(token);
  logger.info('Request authenticated via Firebase token', { uid: decoded.uid, method, path });
  return decoded;
}

export function unauthorized(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function badRequest(message = 'Bad request') {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function serverError(err: unknown) {
  const message = err instanceof Error ? err.message : 'Internal server error';
  logger.error('[API Error]', { error: message });
  return NextResponse.json({ error: message }, { status: 500 });
}
