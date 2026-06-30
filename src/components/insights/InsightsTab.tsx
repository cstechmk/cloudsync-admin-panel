import { AdminUser, formatBytes, PLAN_OPTIONS, getPlan, normalizePlanKey } from '@/lib/constants';
import { Shield, PieChart, Activity } from 'lucide-react';
import { motion } from 'framer-motion';

type InsightsStats = {
  total: number;
  plans: Record<string, number>;
};

export function InsightsTab({ users, stats }: { users: AdminUser[]; stats: InsightsStats }) {
  const overStorage = users.filter(u => {
    const used = u.uploadStats?.totalBytesUploaded || 0;
    const planKey = normalizePlanKey(u.plan);
    const q = getPlan(planKey).quota;
    if (!isFinite(q)) return false;
    const pct = Math.min(100, Math.round((used / q) * 100));
    return pct >= 90;
  });

  return (
    <div className="mx-auto animate-in fade-in duration-500">
      <div className="mb-8">
        <h2 className="text-xl font-extrabold text-slate-900 leading-tight">System Insights</h2>
        <p className="text-xs text-slate-500 font-bold mt-1">Cross-platform synchronization metrics</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Tier Distribution */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-violet-50 p-2.5 rounded-xl border border-violet-100">
              <PieChart size={18} className="text-violet-600" />
            </div>
            <p className="font-extrabold text-slate-900 text-sm">Tier Distribution</p>
          </div>
          
          <div className="flex-1 flex flex-col justify-center gap-5">
            {[
              ...PLAN_OPTIONS.map(p => ({ label: `${p.label} Tier`, val: stats.plans[p.key] || 0, color: p.color })),
            ].map(p => {
              const pct = stats.total > 0 ? (p.val / stats.total) * 100 : 0;
              return (
                <div key={p.label}>
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-xs font-bold text-slate-600">{p.label}</span>
                    <div className="text-right leading-none">
                      <span className="text-sm font-extrabold text-slate-900">{p.val}</span>
                      <span className="text-[0.65rem] text-slate-400 font-bold ml-1.5">{pct.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/60">
                    <motion.div
                      initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                      className="h-full rounded-full" style={{ backgroundColor: p.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quota Watchlist */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col hover:shadow-md transition-shadow lg:col-span-2">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-100">
              <Activity size={18} className="text-amber-500" />
            </div>
            <div>
              <p className="font-extrabold text-slate-900 text-sm">Top Storage Consumers</p>
              <p className="text-[0.65rem] font-bold text-amber-600 bg-amber-50/50 mt-1 inline-block px-1.5 py-0.5 rounded-md border border-amber-100">
                {overStorage.length} warning(s) active
              </p>
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-3 min-h-50 overflow-y-auto pr-2 custom-scrollbar">
            {overStorage.length === 0 ? (
              <div className="m-auto text-center opacity-50">
                <Shield size={32} className="text-slate-400 mx-auto mb-3" />
                <p className="text-xs font-bold text-slate-500">All users within safe limits</p>
              </div>
            ) : (
              [...overStorage]
                .sort((a, b) => (b.uploadStats?.totalBytesUploaded || 0) - (a.uploadStats?.totalBytesUploaded || 0))
                .map(u => {
                  const used = u.uploadStats?.totalBytesUploaded || 0;
                  const planKey = normalizePlanKey(u.plan);
                  const q = getPlan(planKey).quota;
                  const pct = !isFinite(q) ? 0 : Math.min(100, Math.round((used / q) * 100));
                  return (
                    <div key={u.uid} className="flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 font-extrabold text-xs flex items-center justify-center border border-red-100 shrink-0">
                        {u.name?.[0] || '?'}
                      </div>
                      <div className="flex-1 w-full min-w-0">
                        <div className="flex justify-between items-center mb-1 flex-wrap gap-2">
                          <p className="font-bold text-[0.8rem] text-slate-800 leading-none truncate">{u.email}</p>
                          <span className="text-[0.65rem] font-extrabold text-red-500">{pct}% Used</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-red-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <span className="text-[0.65rem] font-bold text-slate-500 whitespace-nowrap mt-2 sm:mt-0 sm:ml-4">
                        {formatBytes(used)}
                      </span>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
