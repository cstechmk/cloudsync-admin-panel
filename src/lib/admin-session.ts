import { SignJWT, jwtVerify } from 'jose';
import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'admin_session';
const SESSION_TTL_S = 8 * 60 * 60; // 8 hours

function getSecret(): Uint8Array {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('ADMIN_SESSION_SECRET env var missing or too short (need ≥32 chars)');
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionCookie(email: string, res: NextResponse): Promise<void> {
  const token = await new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_S}s`)
    .sign(getSecret());

  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TTL_S,
    path: '/',
  });
}

export async function clearSessionCookie(res: NextResponse): Promise<void> {
  res.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' });
}

export async function getSessionEmail(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return (payload.email as string) ?? null;
  } catch {
    return null;
  }
}

export function isAdminEmail(email: string): boolean {
  const allowed = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}
