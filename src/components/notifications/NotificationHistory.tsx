'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { NotificationLog } from '@/lib/constants';
import { RefreshCw, MessageSquare, Bell, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';

export function NotificationHistory() {
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this notification log?')) return;
    setDeleting(id);
    try {
      await apiFetch(`/api/notifications/${id}`, { method: 'DELETE' });
      setLogs(prev => prev.filter(l => l.id !== id));
    } catch (err) {
      console.error('Failed to delete notification:', err);
    } finally {
      setDeleting(null);
    }
  };

  const fetchLogs = useCallback(async () => {
    try {
      const data = await apiFetch<{ notifications: NotificationLog[] }>('/api/notifications');
      setLogs(data.notifications);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  if (loading) {
    return (
      <div className="text-center p-16 flex justify-center">
        <RefreshCw className="animate-spin text-indigo-600" size={28} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {logs.length === 0 ? (
        <div className="text-center p-16 opacity-50 flex flex-col items-center">
          <MessageSquare size={44} className="text-slate-400 mb-3.5" />
          <p className="text-slate-400 font-bold">No notifications sent yet.</p>
        </div>
      ) : (
        logs.map(log => {
          const ts = log.sentAt ? new Date(log.sentAt) : null;
          const targetLabel = log.target === 'all' ? 'All Users' : log.target === 'plan' ? `Plan: ${log.targetPlan}` : 'Single User';
          
          let typeColor = 'text-indigo-600';
          let bgTypeClass = 'bg-indigo-50 border-indigo-200';
          if (log.notificationType === 'banner') {
            typeColor = 'text-amber-500';
            bgTypeClass = 'bg-amber-50 border-amber-200';
          } else if (log.notificationType === 'redirect') {
            typeColor = 'text-emerald-500';
            bgTypeClass = 'bg-emerald-50 border-emerald-200';
          }
          const typeLabel = log.notificationType === 'banner' ? 'Banner' : log.notificationType === 'redirect' ? 'Redirect' : 'Text';
          
          return (
            <motion.div
              key={log.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white border border-slate-200 p-5 md:p-6 rounded-[0.875rem] flex items-start gap-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="bg-indigo-50/50 p-2.5 rounded-xl border border-indigo-100/30 shrink-0">
                <Bell size={18} className="text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start gap-3 flex-wrap">
                  <p className="font-extrabold text-[0.9rem] text-slate-900 leading-tight">{log.title}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[0.68rem] text-slate-400 font-semibold whitespace-nowrap">
                      {ts ? ts.toLocaleString() : '—'}
                    </span>
                    <button
                      onClick={() => handleDelete(log.id)}
                      disabled={deleting === log.id}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                      title="Delete log"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <p className="text-[0.8rem] text-slate-500 mt-1.5 leading-relaxed">{log.body}</p>
                {log.redirectUrl && (
                  <a href={log.redirectUrl} target="_blank" rel="noreferrer" className="text-[0.75rem] text-indigo-600 mt-1.5 inline-flex items-center gap-1 no-underline font-semibold hover:underline">
                    🔗 {log.redirectUrl}
                  </a>
                )}
                <div className="flex gap-2.5 mt-3.5 flex-wrap">
                  <span className={`text-[0.65rem] font-bold px-2 py-0.5 rounded-md border ${typeColor} ${bgTypeClass}`}>{typeLabel}</span>
                  <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-md text-indigo-600 bg-indigo-50/70 border border-indigo-100">{targetLabel}</span>
                  <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-md text-emerald-600 bg-emerald-50 border border-emerald-100/50">✓ {log.sentCount} sent</span>
                  {log.failedCount > 0 && (
                    <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-md text-red-600 bg-red-50 border border-red-100/50">✗ {log.failedCount} failed</span>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })
      )}
    </div>
  );
}
