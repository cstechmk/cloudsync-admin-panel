'use client';

import { useState, useRef, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { AdminUser, PLAN_OPTIONS, normalizePlanKey } from '@/lib/constants';
import {
  X, Users, Crown, User, Smartphone, BellRing, Bell, BellOff,
  MessageSquare, ExternalLink, RefreshCw, Send, Check,
} from 'lucide-react';
import { motion } from 'framer-motion';

interface SendNotificationModalProps {
  users: AdminUser[];
  onClose: () => void;
}

export function SendNotificationModal({ users, onClose }: SendNotificationModalProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [redirectUrl, setRedirectUrl] = useState('');
  const [notificationType, setNotificationType] = useState('text');
  const [target, setTarget] = useState('all');
  const [targetPlan, setTargetPlan] = useState('free');
  const [targetUser, setTargetUser] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; sent?: number; failed?: number; message?: string } | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const usersWithToken = users.filter(u => u.fcmToken);

  const getTargetTokens = () => {
    if (target === 'token') {
      const t = manualToken.trim();
      return t ? [{ token: t, name: 'Manual Token' }] : [];
    }
    let filtered = usersWithToken;
    if (target === 'plan') filtered = filtered.filter(u => normalizePlanKey(u.plan) === targetPlan);
    if (target === 'single') filtered = filtered.filter(u => (u.uid || u.id) === targetUser);
    return filtered.map(u => ({ token: u.fcmToken!, name: u.name || u.email || '' }));
  };

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) return;
    const targets = getTargetTokens();
    if (targets.length === 0) {
      setResult({ success: false, message: 'No valid FCM token found for this target.' });
      return;
    }
    setSending(true);
    setResult(null);
    let sent = 0, failed = 0;

    for (const { token } of targets) {
      try {
        const res = await apiFetch<{ success: boolean }>('/api/send-notification', {
          method: 'POST',
          body: JSON.stringify({
            token, title, body, notificationType,
            imageUrl: imageUrl.trim() || undefined,
            url: redirectUrl.trim() || undefined,
          }),
        });
        if (res.success) sent++; else failed++;
      } catch { failed++; }
    }

    try {
      await apiFetch('/api/notifications', {
        method: 'POST',
        body: JSON.stringify({
          title, body, target, notificationType,
          targetPlan: target === 'plan' ? targetPlan : null,
          targetUserId: target === 'single' ? targetUser : null,
          redirectUrl: redirectUrl.trim() || null,
          imageUrl: imageUrl.trim() || null,
          sentCount: sent, failedCount: failed, totalTargeted: targets.length,
        }),
      });
    } catch { /* best-effort */ }

    setSending(false);
    setResult({ success: true, sent, failed });
  };

  const handleSaveToken = async (uid: string, token: string) => {
    if (!uid || !token.trim()) return;
    try {
      await apiFetch(`/api/users/${uid}`, {
        method: 'PATCH',
        body: JSON.stringify({ fcmToken: token.trim() }),
      });
      alert('Token saved');
    } catch (err) {
      console.error(err);
      alert('Failed to save token');
    }
  };

  const tokenCount = getTargetTokens().length;
  const canSend = title.trim() && body.trim() && tokenCount > 0;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-6 z-1000" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white border border-slate-200 p-8 max-w-135 w-full max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-8 border-b border-slate-200 pb-5">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100/50">
              <BellRing size={22} className="text-indigo-600" />
            </div>
            <div>
              <h2 className="text-[1.15rem] font-extrabold text-slate-900 tracking-tight">Push Notification</h2>
              <p className="text-[0.7rem] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Firebase Messaging</p>
            </div>
          </div>
          <button onClick={onClose} className="bg-transparent border-none cursor-pointer text-slate-400 hover:text-slate-600 transition-colors p-2 rounded-full hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-6">
          {/* Target */}
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500 mb-2.5">Target Audience</p>
            <div className="flex gap-2.5 flex-wrap">
              {[
                { value: 'all', label: 'All Users', icon: Users },
                { value: 'plan', label: 'By Plan', icon: Crown },
                { value: 'single', label: 'Single User', icon: User },
                { value: 'token', label: 'Direct Token', icon: Smartphone },
              ].map(({ value, label, icon: Icon }) => (
                <button 
                  key={value} 
                  onClick={() => { setTarget(value); setResult(null); }} 
                  className={`flex-1 min-w-20 p-3 rounded-xl flex flex-col items-center gap-2 cursor-pointer font-bold text-[0.75rem] transition-all border ${
                    target === value 
                      ? 'border-indigo-500 bg-indigo-50/50 text-indigo-700 shadow-sm' 
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon size={16} className={target === value ? "text-indigo-600" : "text-slate-400"} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {target === 'plan' && (
            <div>
              <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500 mb-2.5">Select Plan</p>
              <select 
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-4 py-2.5 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 cursor-pointer appearance-none"
                value={targetPlan} onChange={e => setTargetPlan(e.target.value)}
              >
                {PLAN_OPTIONS.map(plan => (
                  <option key={plan.key} value={plan.key}>{plan.label} Plan</option>
                ))}
              </select>
            </div>
          )}

          {target === 'single' && (
            <div>
              <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500 mb-2.5">Select User</p>
              <div className="relative" ref={searchRef}>
                <input
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-4 py-2.5 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Search by name, email or mobile..."
                  value={userSearch}
                  onChange={e => { setUserSearch(e.target.value); setTargetUser(''); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                />
                {showDropdown && (() => {
                  const q = userSearch.toLowerCase();
                  const matches = users.filter(u => {
                    if (!q) return true;
                    return (
                      (u.name || '').toLowerCase().includes(q) ||
                      (u.displayName || '').toLowerCase().includes(q) ||
                      (u.email || '').toLowerCase().includes(q) ||
                      (u.mobile || '').toLowerCase().includes(q)
                    );
                  });
                  if (matches.length === 0) return null;
                  return (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                      {matches.map(u => {
                        const uid = u.uid || u.id;
                        const hasToken = !!u.fcmToken;
                        return (
                          <button
                            key={uid}
                            type="button"
                            className={`w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-indigo-50 transition-colors ${!hasToken ? 'opacity-50' : ''}`}
                            onClick={() => {
                              if (!hasToken) return;
                              setTargetUser(uid);
                              setUserSearch(u.name || u.displayName || u.email || '');
                              setShowDropdown(false);
                            }}
                          >
                            <div className="w-7 h-7 shrink-0 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 font-extrabold text-xs">
                              {(u.name || u.email || '?').charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-900 truncate">{u.name || u.displayName || '—'}</p>
                              <p className="text-xs text-slate-500 truncate">{u.email}{u.mobile ? ` · ${u.mobile}` : ''}</p>
                            </div>
                            {!hasToken && <span className="text-[0.65rem] font-bold text-amber-500 shrink-0">No token</span>}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
                {targetUser && (() => {
                  const sel = users.find(u => (u.uid || u.id) === targetUser);
                  return sel ? (
                    <p className="mt-1.5 text-[0.72rem] font-bold text-emerald-600">✓ {sel.name || sel.email}</p>
                  ) : null;
                })()}
              </div>
            </div>
          )}

          {target === 'token' && (
            <div>
              <div className="flex justify-between items-center mb-2.5">
                <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">FCM Device Token</p>
                <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer" className="text-[0.65rem] text-indigo-600 font-bold decoration-indigo-200 underline hover:decoration-indigo-600">
                  Firebase Console ↗
                </a>
              </div>
              <textarea 
                className="w-full h-20 bg-slate-50 font-mono text-[0.8rem] text-slate-700 px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none break-all"
                placeholder="Paste FCM registration token here..."
                value={manualToken} onChange={e => setManualToken(e.target.value)}
              />
              {manualToken.trim() && (
                <div className="mt-3 flex gap-3 items-center">
                  <select 
                    className="flex-1 bg-slate-50 border border-slate-200 text-slate-700 px-3 py-2 rounded-lg text-xs font-semibold outline-none focus:border-indigo-500 cursor-pointer appearance-none"
                    value={targetUser} onChange={e => setTargetUser(e.target.value)}
                  >
                    <option value="">Link to User Profile (optional)</option>
                    {users.map(u => (
                      <option key={u.uid || u.id} value={u.uid || u.id}>{u.name || u.displayName || u.email}</option>
                    ))}
                  </select>
                  {targetUser && (
                    <button 
                      onClick={() => handleSaveToken(targetUser, manualToken)} 
                      className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-200 cursor-pointer hover:bg-emerald-100 flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Check size={13} /> Save Link
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Token status */}
          <div className={`flex items-center gap-2.5 p-3 rounded-xl border ${tokenCount > 0 ? 'bg-emerald-50 border-emerald-200/60 text-emerald-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
            {tokenCount > 0 ? <Bell size={16} /> : <BellOff size={16} />}
            <span className="text-[0.8rem] font-bold">
              {tokenCount > 0
                ? `${tokenCount} device${tokenCount > 1 ? 's' : ''} will receive this push event`
                : 'No recognized device tokens'}
            </span>
          </div>

          {/* Notification Type */}
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500 mb-2.5">Notification Style</p>
            <div className="flex gap-2.5 border border-slate-200 rounded-xl p-1 bg-slate-50">
              {[
                { value: 'text', label: 'Default Text', icon: MessageSquare },
                { value: 'banner', label: 'Rich Image', icon: BellRing },
                { value: 'redirect', label: 'App Link', icon: ExternalLink },
              ].map(({ value, label, icon: Icon }) => (
                <button 
                  key={value} 
                  onClick={() => setNotificationType(value)} 
                  className={`flex-1 px-2 py-2.5 rounded-lg flex flex-col items-center gap-1 cursor-pointer transition-all ${
                    notificationType === value 
                      ? 'bg-white shadow-sm border border-slate-200/60 text-indigo-600' 
                      : 'bg-transparent border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Icon size={14} className={notificationType === value ? "text-indigo-500" : "text-slate-400"} />
                  <span className="font-bold text-[0.7rem]">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-100">
            {/* Title */}
            <div>
              <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500 mb-2">Message Title</p>
              <input 
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-4 py-2.5 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-sm"
                placeholder="e.g. Storage Quota Full" value={title} onChange={e => setTitle(e.target.value)} maxLength={60} 
              />
            </div>

            {/* Body */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">Message Content</p>
                <p className="text-[0.65rem] font-bold text-slate-400">{body.length}/300</p>
              </div>
              <textarea 
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-4 py-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-sm h-25 resize-y"
                placeholder="Write your push notification body here..." value={body} onChange={e => setBody(e.target.value)} maxLength={300} 
              />
            </div>

            {(notificationType === 'banner' || notificationType === 'redirect') && (
              <div>
                <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500 mb-2">Media URL <span className="font-normal lowercase">(Optional)</span></p>
                <input 
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-4 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-sm"
                  placeholder="https://calleysync.com/og.jpg" value={imageUrl} onChange={e => setImageUrl(e.target.value)} 
                />
              </div>
            )}

            {notificationType === 'redirect' && (
              <div>
                <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500 mb-2">Deep Link Action <span className="font-normal lowercase">(Optional)</span></p>
                <input 
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-4 py-2.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-sm"
                  placeholder="calleysync://upgrade" value={redirectUrl} onChange={e => setRedirectUrl(e.target.value)} 
                />
              </div>
            )}
          </div>

          {result && (
            <div className={`p-4 rounded-xl border flex items-center gap-3 ${result.success ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              {result.message ? (
                <p className="text-[0.85rem] font-bold text-red-600">{result.message}</p>
              ) : (
                <div className="flex gap-4">
                  <span className="text-[0.85rem] font-bold text-emerald-700 flex items-center gap-2"><Check size={16} /> Delivered to {result.sent}</span>
                  {(result.failed ?? 0) > 0 && <span className="text-[0.85rem] font-bold text-red-600 flex items-center gap-2"><X size={16} /> {result.failed} Failed</span>}
                </div>
              )}
            </div>
          )}

          <button 
            onClick={handleSend} disabled={sending || !canSend} 
            className="w-full mt-2 p-[1.15rem] bg-indigo-600 hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-500/20 active:scale-[0.98] border-none text-white rounded-2xl font-extrabold text-[0.95rem] cursor-pointer transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:shadow-none"
          >
            {sending ? <RefreshCw size={20} className="animate-spin" /> : <Send size={20} />}
            {sending ? 'Pushing to devices...' : tokenCount > 0 ? `Broadcast to ${tokenCount} User${tokenCount !== 1 ? 's' : ''}` : 'Ready to Send'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
