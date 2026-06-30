// In-memory OTP store. Resets on server restart — acceptable for admin-only use.
// Each entry expires after OTP_TTL_MS; auto-cleaned on each write.

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

interface OtpEntry {
  code: string;
  expiresAt: number;
  attempts: number;
}

const store = new Map<string, OtpEntry>();

function sweep() {
  const now = Date.now();
  for (const [email, entry] of store) {
    if (entry.expiresAt < now) store.delete(email);
  }
}

export function saveOtp(email: string, code: string) {
  sweep();
  store.set(email.toLowerCase(), {
    code,
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
  });
}

export type VerifyResult = 'ok' | 'expired' | 'wrong' | 'locked';

export function verifyOtp(email: string, code: string): VerifyResult {
  const key = email.toLowerCase();
  const entry = store.get(key);
  if (!entry || entry.expiresAt < Date.now()) return 'expired';
  if (entry.attempts >= MAX_ATTEMPTS) return 'locked';
  if (entry.code !== code.trim()) {
    entry.attempts++;
    return 'wrong';
  }
  store.delete(key);
  return 'ok';
}
