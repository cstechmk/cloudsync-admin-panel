'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { AdminUser, formatBytes, PLAN_OPTIONS, normalizePlanKey } from '@/lib/constants';
import { X, CheckCircle, Ban, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';

interface PlanModalProps {
  user: AdminUser;
  onClose: () => void;
  onSave: () => void;
}

export function PlanModal({ user, onClose, onSave }: PlanModalProps) {
  const [plan, setPlan] = useState(normalizePlanKey(user.plan));
  const [status, setStatus] = useState(user.status || 'active');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const uid = user.uid || user.id;
      await apiFetch(`/api/users/${uid}`, {
        method: 'PATCH',
        body: JSON.stringify({ plan, status }),
      });
      onSave();
      onClose();
    } catch (e) {
      console.error(e);
      alert('Error updating user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-6 z-1000" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white border border-slate-200 rounded-3xl w-full max-w-120 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg text-slate-900 font-extrabold">Manage User</h3>
            <p className="text-sm text-slate-500 mt-1">{user.email || user.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:bg-slate-100 p-2 rounded-full cursor-pointer transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-6">
          {/* User Identity */}
          <div className="py-2 flex items-center gap-4 border-b border-slate-200 pb-5">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100/50 flex items-center justify-center text-indigo-600 font-extrabold text-lg select-none">
              {(user.name || user.displayName || user.email || '?')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[0.9rem] text-slate-900 truncate">{user.name || user.displayName || 'Unknown'}</p>
              <p className="text-[0.75rem] text-slate-500 truncate">{user.email}</p>
            </div>
          </div>

          {/* Plan */}
          <div className="flex flex-col gap-3">
            <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">Subscription Plan</p>
            {PLAN_OPTIONS.map(p => (
              <button 
                key={p.key} 
                onClick={() => setPlan(p.key)} 
                className={`w-full p-4 rounded-2xl border bg-transparent text-left cursor-pointer transition-all flex items-center justify-between hover:bg-slate-50 ${plan === p.key ? 'border-indigo-500! bg-indigo-50/50!' : 'border-slate-200'}`}
              >
                <div className="flex items-center gap-4">
                  <div className="p-2.5 rounded-xl" style={{ background: `${p.color}1a` }}>
                    <p.icon size={18} color={p.color} />
                  </div>
                  <div className="text-left">
                    <p className={`font-bold text-[0.95rem] ${plan === p.key ? 'text-indigo-700' : 'text-slate-900'}`}>{p.label}</p>
                    <p className="text-[0.8rem] text-slate-500">{formatBytes(p.quota)} Storage · {p.price}{p.termLabel ? ` · ${p.termLabel}` : ''}</p>
                  </div>
                </div>
                {plan === p.key && <CheckCircle size={22} className="text-indigo-600" />}
              </button>
            ))}
          </div>

          {/* Status */}
          <div className="flex flex-col gap-3">
            <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">Account Status</p>
            <div className="flex gap-3">
              {['active', 'blocked'].map(s => {
                const isActive = s === 'active';
                const isSelected = status === s;
                return (
                  <button 
                    key={s} 
                    onClick={() => setStatus(s)} 
                    className={`flex-1 p-3 rounded-xl cursor-pointer font-bold flex items-center justify-center gap-2 border transition-all ${
                      isSelected 
                        ? (isActive ? 'bg-emerald-50 border-emerald-500 text-emerald-600' : 'bg-red-50 border-red-500 text-red-600')
                        : 'bg-transparent border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {isActive ? <CheckCircle size={16} /> : <Ban size={16} />}
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-slate-50 flex gap-4 border-t border-slate-200 rounded-b-3xl">
          <button onClick={onClose} className="flex-1 p-3.5 bg-white border border-slate-200 text-slate-700 rounded-xl cursor-pointer font-bold hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button 
            onClick={handleSave} 
            disabled={saving} 
            className="flex-1 p-3.5 bg-indigo-600 border-none text-white rounded-xl cursor-pointer font-bold shadow-[0_4px_14px_-2px_rgba(99,102,241,0.4)] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed hover:bg-indigo-700 transition-all active:scale-[0.98]"
          >
            {saving ? <><RefreshCw size={16} className="animate-spin" /> Updating...</> : 'Save Changes'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
