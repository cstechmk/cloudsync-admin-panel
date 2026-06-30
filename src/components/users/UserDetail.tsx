'use client';

import {
  getPlan, AdminUser, SyncHistoryEntry,
  formatBytes, formatDate, getProviderInfo, normalizePlanKey,
} from '@/lib/constants';
import {
  User, Phone, RefreshCw, Smartphone, Upload,
  FolderOpen, Activity, Trash2, Monitor,
} from 'lucide-react';
import { StatusToggle } from './StatusToggle';
import { QuotaBar } from './Badges';

interface UserDetailProps {
  user: AdminUser;
  history: SyncHistoryEntry[];
  onDeleteHistory: () => void;
  onDeleteUser: () => void;
  onManagePlan: () => void;
}

export function UserDetail({ user, history, onDeleteHistory, onDeleteUser, onManagePlan }: UserDetailProps) {
  const folderPaths = user.settings?.folderPaths || [];
  const usedBytes = user.uploadStats?.totalBytesUploaded || 0;
  const planKey = normalizePlanKey(user.plan);
  const plan = getPlan(planKey);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1.5fr_1.5fr] gap-6 lg:gap-12 p-8 lg:p-10 bg-slate-50 border-t border-slate-200">
      
      {/* Col 1: Identity & Actions */}
      <div className="flex flex-col gap-6">
        <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3.5 mb-6">
            <div className="bg-indigo-50 p-2.5 rounded-xl border border-indigo-100/50">
              <User size={20} className="text-indigo-500" />
            </div>
            <div>
              <p className="font-extrabold text-base text-slate-900 leading-tight">
                {user.name || user.displayName || 'Anonymous'}
              </p>
              <p className="text-xs text-slate-500 mt-1">{user.email}</p>
            </div>
          </div>

          {user.mobile && (
            <div className="px-3 py-2.5 bg-slate-100 rounded-lg mb-6 flex items-center gap-2">
              <Phone size={14} className="text-indigo-500" />
              <span className="text-sm font-bold text-slate-900">{user.mobile}</span>
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            <StatusToggle user={user} />
            <button
              onClick={onDeleteUser}
              className="w-full p-3 bg-red-50 hover:bg-red-100 border border-red-100 text-red-600 rounded-xl font-bold text-sm cursor-pointer flex items-center justify-center gap-2 transition-colors active:scale-[0.98]"
            >
              <Trash2 size={16} /> Delete User
            </button>
          </div>
        </div>

        <div className="p-5 bg-white rounded-3xl border border-slate-200 shadow-sm">
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500 mb-4">Device Attributes</p>
          <div className="flex flex-col gap-2">
            {[
              { icon: RefreshCw, label: 'Auto Sync', active: user.settings?.autoSync },
              { icon: Smartphone, label: 'Wi-Fi Only', active: user.settings?.wifiOnly },
              { icon: Upload, label: 'Push Only', active: user.settings?.downloadSync },
            ].map((s, i) => (
              <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg font-bold text-xs ${s.active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-500'}`}>
                <s.icon size={14} /> {s.label}
                <div className={`ml-auto w-1.5 h-1.5 rounded-full ${s.active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              </div>
            ))}
            {user.settings?.fileTypeFilter && (
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg font-bold text-xs bg-slate-50 text-slate-500">
                <Upload size={14} /> Filter: {user.settings.fileTypeFilter}
              </div>
            )}
            {(user.settings?.syncIntervalMinutes ?? 0) > 0 && (
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg font-bold text-xs bg-slate-50 text-slate-500">
                <RefreshCw size={14} /> Every {(user.settings!.syncIntervalMinutes! % 60 === 0) ? `${user.settings!.syncIntervalMinutes! / 60}h` : `${user.settings!.syncIntervalMinutes}m`}
              </div>
            )}
          </div>
          {(user.deviceInfo?.model || user.appInfo?.versionName) && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col gap-1">
              {user.deviceInfo?.model && (
                <p className="text-[0.7rem] text-slate-500 font-semibold">{user.deviceInfo.brand} {user.deviceInfo.model} · Android {user.deviceInfo.androidVersion}</p>
              )}
              {user.appInfo?.versionName && (
                <p className="text-[0.7rem] text-slate-400">App v{user.appInfo.versionName}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Col 2: Plan & Folders */}
      <div className="flex flex-col gap-6">
        <div 
          className="p-6 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col"
          style={{ borderLeftWidth: '5px', borderLeftColor: plan.color }}
        >
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="font-extrabold text-base" style={{ color: plan.color }}>{plan.label} Subscription</p>
              <p className="text-xs text-slate-500 font-medium mt-1">{plan.price}{plan.termLabel ? ` · ${plan.termLabel}` : ''}</p>
            </div>
            <button 
              onClick={onManagePlan} 
              className="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-3 py-1.5 rounded-lg font-bold text-[0.7rem] cursor-pointer transition-colors"
            >
              Adjust
            </button>
          </div>
          <QuotaBar used={usedBytes} planKey={planKey} />
        </div>

        <div className="flex-1 p-6 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="flex items-center gap-2.5 mb-5">
            <FolderOpen size={18} className="text-amber-500" />
            <span className="font-extrabold text-sm text-slate-900">Connected Folders</span>
            <span className="ml-auto text-[0.7rem] font-bold text-slate-500">{folderPaths.length} Active</span>
          </div>
          <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 min-h-30">
            {folderPaths.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-8">No targets defined</p>
            ) : (
              folderPaths.map((path, idx) => {
                // Convert Android content URI to readable path
                // e.g. content://...tree/primary%3ADCIM%2FTest → /DCIM/Test
                let label = path;
                try {
                  const decoded = decodeURIComponent(path);
                  const treeMatch = decoded.match(/tree\/([^/]+)$/);
                  if (treeMatch) label = '/' + treeMatch[1].replace(':', '/');
                  else if (decoded.includes('/')) label = decoded.split('/').slice(-2).join('/');
                } catch {}
                return (
                  <div key={idx} className="px-3 py-2.5 bg-slate-50 rounded-lg border border-slate-100 flex gap-2.5 items-start" title={path}>
                    <Monitor size={14} className="text-slate-400 mt-0.5 shrink-0" />
                    <span className="text-xs text-slate-700 font-semibold break-all leading-tight">{label}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Col 3: Sync Activity */}
      <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col">
        <div className="flex items-center gap-2.5 mb-6">
          <Activity size={18} className="text-violet-500" />
          <span className="font-extrabold text-sm text-slate-900">Recent Activity</span>
          <button onClick={onDeleteHistory} className="ml-auto bg-transparent border-none text-red-500 text-[0.75rem] font-bold cursor-pointer hover:underline">
            Clear
          </button>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col min-h-55">
          {history.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-8">No history data</p>
          ) : (
            history.map((entry, idx) => {
              const provider = getProviderInfo(entry.cloudProvider);
              const Icon = provider.icon;
              return (
                <div key={idx} className={`py-4 flex gap-3 ${idx === history.length - 1 ? '' : 'border-b border-slate-100'}`}>
                  <div className="p-2 rounded-xl h-fit border" style={{ background: `${provider.color}14`, borderColor: `${provider.color}22` }}>
                    <Icon size={15} color={provider.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1.5 flex-wrap gap-2">
                      <span className="text-xs font-extrabold text-slate-900">{provider.label} Sync</span>
                      <span className="text-[0.65rem] text-slate-500 font-medium whitespace-nowrap">{formatDate(entry.timestamp)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[0.7rem] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-md">+{formatBytes(entry.bytesPushed || 0)}</span>
                      <span className="text-[0.7rem] text-slate-500 font-semibold">{entry.filesPushed || 0} items</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
