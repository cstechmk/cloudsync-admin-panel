import { NextRequest, NextResponse } from 'next/server';
import { transporter, defaultFrom } from '@/lib/mail';
import { saveOtp, verifyOtp } from '@/lib/otp-store';
import { createSessionCookie, isAdminEmail } from '@/lib/admin-session';
import { logger } from '@/lib/logger';

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// POST /api/auth/otp  { action: 'send', email }
//                     { action: 'verify', email, code }
export async function POST(req: NextRequest) {
  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { action, email, code } = body;

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email required' }, { status: 400 });
  }

  if (!isAdminEmail(email)) {
    logger.warn('OTP request from non-admin email', { email, action });
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const isDev = process.env.NODE_ENV !== 'production';

  // ── SEND ──────────────────────────────────────────────────────────────────
  if (action === 'send') {
    const otp = generateOtp();
    saveOtp(email, otp);
    logger.info('OTP generated and saved', { email });

    if (isDev) {
      // Dev bypass: skip email, log OTP to console. Use 000000 to login.
      logger.info(`[DEV] OTP for ${email}: ${otp} — or use bypass code 000000`);
      console.log(`\n🔑 [DEV OTP] ${email} → ${otp}  (bypass: 000000)\n`);
      return NextResponse.json({ ok: true });
    }

    try {
      await transporter.sendMail({
        from: defaultFrom,
        to: email,
        subject: 'CloudSync Admin — Your login code',
        text: `Your one-time login code is: ${otp}\n\nThis code expires in 10 minutes. Do not share it.`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f8fafc;border-radius:16px">
            <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px">CloudSync Admin</h2>
            <p style="margin:0 0 24px;color:#64748b;font-size:14px">Your one-time login code:</p>
            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
              <span style="font-size:36px;font-weight:900;letter-spacing:10px;color:#6366f1">${otp}</span>
            </div>
            <p style="margin:0;color:#94a3b8;font-size:12px">Expires in 10 minutes. Do not share this code.</p>
          </div>`,
      });
    } catch (err) {
      logger.error('OTP email send failed', { email, error: err instanceof Error ? err.message : String(err) });
      return NextResponse.json({ error: 'Failed to send OTP email' }, { status: 500 });
    }

    logger.info('OTP email sent successfully', { email });
    return NextResponse.json({ ok: true });
  }

  // ── VERIFY ────────────────────────────────────────────────────────────────
  if (action === 'verify') {
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Code required' }, { status: 400 });
    }

    // Dev bypass: accept 000000 as universal code
    if (isDev && code === '000000') {
      logger.info('[DEV] Admin login via bypass code', { email });
      const res = NextResponse.json({ ok: true });
      await createSessionCookie(email, res);
      return res;
    }

    const result = verifyOtp(email, code);

    if (result === 'expired') { logger.warn('OTP verify: expired', { email }); return NextResponse.json({ error: 'Code expired. Request a new one.' }, { status: 401 }); }
    if (result === 'locked')  { logger.warn('OTP verify: locked (too many attempts)', { email }); return NextResponse.json({ error: 'Too many attempts. Request a new code.' }, { status: 429 }); }
    if (result === 'wrong')   { logger.warn('OTP verify: wrong code', { email }); return NextResponse.json({ error: 'Invalid code' }, { status: 401 }); }

    logger.info('Admin OTP login successful', { email });
    const res = NextResponse.json({ ok: true });
    await createSessionCookie(email, res);
    return res;
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

// DELETE /api/auth/otp — logout (clear session cookie)
export async function DELETE(req: NextRequest) {
  const { getSessionEmail } = await import('@/lib/admin-session');
  const email = await getSessionEmail(req);
  logger.info('Admin logout', { email: email ?? 'unknown' });
  const res = NextResponse.json({ ok: true });
  res.cookies.set('admin_session', '', { maxAge: 0, path: '/' });
  return res;
}
