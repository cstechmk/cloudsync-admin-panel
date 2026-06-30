'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';

type Step = 'email' | 'otp';

interface LoginFormProps {
  onAuthenticated: () => void;
}

export function LoginForm({ onAuthenticated }: LoginFormProps) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, []);

  function startCooldown() {
    setResendCooldown(60);
    cooldownRef.current = setInterval(() => {
      setResendCooldown(s => {
        if (s <= 1) { clearInterval(cooldownRef.current!); return 0; }
        return s - 1;
      });
    }, 1000);
  }

  async function handleSendOtp(e?: React.FormEvent) {
    e?.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', email }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to send code'); return; }
      setStep('otp');
      setOtp(['', '', '', '', '', '']);
      startCooldown();
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch {
      setError('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    const code = otp.join('');
    if (code.length < 6) return;
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', email, code }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Invalid code'); setLoading(false); return; }
      onAuthenticated();
    } catch {
      setError('Network error. Try again.');
      setLoading(false);
    }
  }

  function handleOtpInput(i: number, val: string) {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[i] = digit;
    setOtp(next);
    if (digit && i < 5) otpRefs.current[i + 1]?.focus();
    if (next.every(d => d !== '') && next.join('').length === 6) {
      // Auto-submit when all filled
      setTimeout(() => handleVerifyOtp(), 0);
    }
  }

  function handleOtpKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text.length === 6) {
      setOtp(text.split(''));
      otpRefs.current[5]?.focus();
      setTimeout(() => handleVerifyOtp(), 0);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-6 z-50 min-h-screen">
      <AnimatePresence mode="wait">
        {step === 'email' ? (
          <motion.form
            key="email"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            onSubmit={handleSendOtp}
            className="bg-white border border-slate-200 rounded-3xl shadow-xl w-full max-w-sm p-10"
          >
            <div className="text-center mb-10">
              <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200 inline-block mb-5">
                <Image src="/logo.png" alt="CloudSync" width={64} height={64} className="rounded-xl" />
              </div>
              <h1 className="text-2xl font-extrabold text-slate-900">CloudSync Admin</h1>
              <p className="text-slate-500 text-sm mt-2 font-bold">Powered by CS Tech Infosolution</p>
            </div>

            <div className="flex flex-col gap-5">
              <div>
                <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Admin Email</p>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-4 py-2.5 rounded-xl outline-none transition-all focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                  placeholder="admin@example.com"
                />
              </div>
              {error && <p className="text-red-500 text-sm text-center font-semibold">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 p-3.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] transition-all border-none text-white rounded-xl font-bold text-sm disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? 'Sending…' : 'Send Login Code'}
              </button>
            </div>
          </motion.form>
        ) : (
          <motion.div
            key="otp"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white border border-slate-200 rounded-3xl shadow-xl w-full max-w-sm p-10"
          >
            <div className="text-center mb-8">
              <div className="bg-indigo-50 p-3 rounded-2xl border border-indigo-100 inline-block mb-5">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
              </div>
              <h1 className="text-2xl font-extrabold text-slate-900">Check your email</h1>
              <p className="text-slate-500 text-sm mt-2">
                We sent a 6-digit code to<br />
                <span className="font-bold text-slate-700">{email}</span>
              </p>
            </div>

            <div className="flex gap-2 justify-center mb-6" onPaste={handleOtpPaste}>
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={el => { otpRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleOtpInput(i, e.target.value)}
                  onKeyDown={e => handleOtpKeyDown(i, e)}
                  className="w-11 h-13 text-center text-2xl font-extrabold text-slate-900 bg-slate-50 border-2 border-slate-200 rounded-xl outline-none transition-all focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                />
              ))}
            </div>

            {error && <p className="text-red-500 text-sm text-center font-semibold mb-4">{error}</p>}

            <button
              onClick={handleVerifyOtp}
              disabled={loading || otp.join('').length < 6}
              className="w-full p-3.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] transition-all border-none text-white rounded-xl font-bold text-sm disabled:opacity-70 disabled:cursor-not-allowed mb-4"
            >
              {loading ? 'Verifying…' : 'Verify Code'}
            </button>

            <div className="text-center">
              {resendCooldown > 0 ? (
                <p className="text-slate-400 text-xs font-bold">Resend in {resendCooldown}s</p>
              ) : (
                <button
                  onClick={() => handleSendOtp()}
                  className="text-indigo-600 text-xs font-bold hover:underline bg-transparent border-none cursor-pointer"
                >
                  Resend code
                </button>
              )}
              <button
                onClick={() => { setStep('email'); setError(''); setOtp(['', '', '', '', '', '']); }}
                className="block mx-auto mt-2 text-slate-400 text-xs font-bold hover:text-slate-600 bg-transparent border-none cursor-pointer"
              >
                ← Change email
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
