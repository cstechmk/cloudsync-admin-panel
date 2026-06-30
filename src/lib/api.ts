import { auth } from './firebase';

/**
 * Fetch wrapper for admin panel API calls.
 *
 * Auth priority (mirrors auth-server.ts verifyToken):
 *   1. OTP session cookie — sent automatically by browser (admin panel)
 *   2. Firebase Bearer token — used by Android app; admin has no Firebase user so this is skipped
 *
 * If neither is present the backend returns 401.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const extraHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  // Attach Firebase token only when a user is signed in (Android-originated flows).
  // Admin panel uses OTP cookie — no Firebase user present, no header needed.
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    extraHeaders['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(path, {
    ...options,
    credentials: 'include', // ensure OTP session cookie is sent
    headers: extraHeaders,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json() as T;
}
