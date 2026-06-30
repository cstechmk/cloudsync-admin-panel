import { COLORS, getPlan, normalizePlanKey } from '@/lib/constants';
import { Cloud, Shield, ShieldAlert } from 'lucide-react';


const formatBytes = (bytes: number) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export function PlanBadge({ planKey }: { planKey: string }) {
  const plan = getPlan(normalizePlanKey(planKey));
  const PlanIcon = plan.icon || Cloud;
  return (
    <div
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-extrabold text-[0.7rem] uppercase tracking-wider"
      style={{ background: `${plan.color}14`, color: plan.color, border: `1px solid ${plan.color}22` }}
    >
      <PlanIcon size={12} strokeWidth={3} />
      {plan.label}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const isActive = status === 'active';
  const color = isActive ? COLORS.success : COLORS.danger;
  const Icon = isActive ? Shield : ShieldAlert;

  return (
    <div
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-extrabold text-[0.7rem] uppercase tracking-wider"
      style={{ background: `${color}14`, color: color, border: `1px solid ${color}22` }}
    >
      <Icon size={12} strokeWidth={3} />
      {isActive ? 'Active' : 'Blocked'}
    </div>
  );
}

export function QuotaBar({ used, planKey, size = 'default' }: { used: number; planKey: string; size?: 'sm' | 'default' }) {
  const plan = getPlan(normalizePlanKey(planKey));
  const quota = plan.quota;
  const isUnlimited = !isFinite(quota);
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / quota) * 100));
  const pbSize = size === 'sm' ? 'h-1.5' : 'h-2.5';
  const overStorage = !isUnlimited && pct >= 90;

  return (
    <div className="w-full">
      <div className={`w-full bg-slate-100 rounded-full overflow-hidden mb-1.5 border border-slate-200 ${pbSize}`}>
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, background: overStorage ? COLORS.danger : plan.color }}
        />
      </div>
      <div className="flex justify-between items-center text-[0.65rem] font-bold">
        <span className={overStorage ? "text-red-500" : "text-slate-500"}>
          {isUnlimited ? 'Unlimited' : (overStorage ? 'Capacity Warning' : `${pct}% Used`)}
        </span>
        <span className="text-slate-400">{formatBytes(used)} / {isUnlimited ? 'Unlimited' : formatBytes(quota)}</span>
      </div>
    </div>
  );
}
