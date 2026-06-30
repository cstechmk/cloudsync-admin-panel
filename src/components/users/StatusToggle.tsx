'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { AdminUser } from '@/lib/constants';
import { RefreshCw, CheckCircle, Ban } from 'lucide-react';

export function StatusToggle({ user, onUpdated }: { user: AdminUser; onUpdated?: () => void }) {
  const [loading, setLoading] = useState(false);
  const status = user.status || 'active';
  const isBlocked = status === 'blocked';

  const toggleStatus = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    try {
      const uid = user.uid || user.id;
      await apiFetch(`/api/users/${uid}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: isBlocked ? 'active' : 'blocked' }),
      });
      onUpdated?.();
    } catch (err) {
      console.error('Failed to update status:', err);
      alert('Error: Could not update user status.');
    } finally {
      setLoading(false);
    }
  };

  const baseClasses = "w-full p-3 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 transition-all duration-200 border";
  const stateClasses = isBlocked 
    ? "bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100" 
    : "bg-red-50 border-red-200 text-red-600 hover:bg-red-100";
  const loadingClasses = loading ? "opacity-60 cursor-not-allowed" : "cursor-pointer";

  return (
    <button
      onClick={toggleStatus}
      disabled={loading}
      className={`${baseClasses} ${stateClasses} ${loadingClasses}`}
    >
      {loading ? <RefreshCw size={16} className="animate-spin" /> : (isBlocked ? <CheckCircle size={16} /> : <Ban size={16} />)}
      {loading ? 'Updating...' : (isBlocked ? 'Activate User' : 'Block User')}
    </button>
  );
}
