'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowUpRight,
  Bell, BellRing,
  ChevronDown, ChevronRight,
  HardDrive,
  LogOut,
  RefreshCw,
  Search,
  Send,
  Settings,
  Users,
} from 'lucide-react';
import Image from 'next/image';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { apiFetch } from '@/lib/api';
import {
  AdminUser,
  COLORS,
  formatBytes, formatDate, PLAN_OPTIONS, PLAN_ORDER, normalizePlanKey,
  SyncHistoryEntry,
} from '@/lib/constants';
import { InsightsTab } from './insights/InsightsTab';
import { LoginForm } from './LoginForm';
import { NotificationHistory } from './notifications/NotificationHistory';
import { SendNotificationModal } from './notifications/SendNotificationModal';
import { SubscriptionsTab } from './subscriptions/SubscriptionsTab';
import { PlanBadge, QuotaBar, StatusBadge } from './users/Badges';
import { PlanModal } from './users/PlanModal';
import { ProviderIcons } from './users/ProviderIcons';
import { UserDetail } from './users/UserDetail';

function StatCard({ title, value, sub, icon: Icon, color, trend }: {
  title: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string; trend?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col transition-all duration-300"
    >
      <div className="flex justify-between items-start">
        <div className="p-3 rounded-xl border" style={{ background: `${color}14`, borderColor: `${color}22` }}>
          <Icon size={22} color={color} />
        </div>
        {trend && (
          <span className="text-[0.75rem] text-emerald-600 font-extrabold flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-md">
            ↑ {trend}
          </span>
        )}
      </div>
      <div className="mt-4">
        <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500 mb-1">{title}</p>
        <div className="flex items-baseline gap-2">
          <p className="text-3xl font-extrabold text-slate-900 tracking-tight">{value}</p>
          {sub && <span className="text-[0.7rem] text-slate-500 font-bold">{sub}</span>}
        </div>
      </div>
    </motion.div>
  );
}

export function DashboardShell() {
  const [adminUser, setAdminUser] = useState<boolean | null>(null); // null=unknown, false=no, true=yes
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [syncHistories, setSyncHistories] = useState<Record<string, SyncHistoryEntry[]>>({});
  const [activeTab, setActiveTab] = useState<'users' | 'overview' | 'notifications' | 'subscriptions'>('users');
  const [search, setSearch] = useState('');
  const [filterPlan, setFilterPlan] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [planModal, setPlanModal] = useState<AdminUser | null>(null);
  const [notifyModal, setNotifyModal] = useState(false);

  useEffect(() => {
    // Check OTP session cookie by calling any authenticated endpoint.
    // A 401 means no valid session; anything else means authenticated.
    fetch('/api/users', { method: 'HEAD' })
      .then(r => {
        if (r.ok || r.status !== 401) {
          setAdminUser(true);
        } else {
          setAdminUser(false);
          setLoading(false);
        }
      })
      .catch(() => { setAdminUser(false); setLoading(false); });
  }, []);

  const fetchUsers = useCallback(async () => {
    if (document.visibilityState === 'hidden') return;
    try {
      const data = await apiFetch<{ users: AdminUser[] }>('/api/users');
      setUsers(data.users);
      setLoading(false);
    } catch (err: any) {
      console.error('Failed to load users:', err);
      setLoading(false);
      if (err?.message?.includes('RESOURCE_EXHAUSTED') || err?.message?.includes('Quota')) {
        console.warn('Backend API quota exceeded or rate limited.');
      }
    }
  }, []);

  useEffect(() => {
    if (!adminUser) return;
    void fetchUsers();
    const interval = setInterval(fetchUsers, 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') void fetchUsers(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [adminUser, fetchUsers]);

  // When a user row is expanded, poll that user's data + history every 15s so all fields reflect live
  useEffect(() => {
    if (!expandedUser) return;
    const uid = expandedUser;
    const refresh = () => {
      apiFetch<{ user: AdminUser }>(`/api/users/${uid}`)
        .then(data => setUsers(prev => prev.map(u => (u.uid || u.id) === uid ? { ...u, ...data.user } : u)))
        .catch(() => {});
      apiFetch<{ history: SyncHistoryEntry[] }>(`/api/users/${uid}/history`)
        .then(data => setSyncHistories(prev => ({ ...prev, [uid]: data.history })))
        .catch(() => {});
    };
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  }, [expandedUser]);

  const stats = useMemo(() => {
    const totalBytes = users.reduce((s, u) => s + (u.uploadStats?.totalBytesUploaded || 0), 0);
    const totalFiles = users.reduce((s, u) => s + (u.uploadStats?.syncCount || 0), 0);
    const overQuota = users.filter(u => {
      const used = u.uploadStats?.totalBytesUploaded || 0;
      const q = PLAN_OPTIONS.find(p => p.key === normalizePlanKey(u.plan))?.quota || PLAN_OPTIONS[0].quota;
      return used >= q * 0.9;
    }).length;
    return {
      total: users.length,
      active: users.filter(u => u.status !== 'blocked').length,
      storage: formatBytes(totalBytes),
      syncs: totalFiles,
      blocked: users.filter(u => u.status === 'blocked').length,
      alerts: overQuota,
      plans: Object.fromEntries(PLAN_ORDER.map(k => [k, users.filter(u => normalizePlanKey(u.plan) === k).length])),
    };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter(u => {
      const matchSearch = !q ||
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.mobile || '').toLowerCase().includes(q) ||
        (u.uid || u.id || '').toLowerCase().includes(q);
      const matchPlan = filterPlan === 'all' || normalizePlanKey(u.plan) === filterPlan;
      const matchStatus = filterStatus === 'all' || (u.status || 'active') === filterStatus;
      return matchSearch && matchPlan && matchStatus;
    });
  }, [users, search, filterPlan, filterStatus]);

  const loadHistory = useCallback(async (uid: string) => {
    try {
      const data = await apiFetch<{ history: SyncHistoryEntry[] }>(`/api/users/${uid}/history`);
      setSyncHistories(prev => ({ ...prev, [uid]: data.history }));
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  }, []);

  const toggleExpand = (uid: string) => {
    if (expandedUser === uid) { setExpandedUser(null); return; }
    setExpandedUser(uid);
    loadHistory(uid);
    // Fetch fresh user data so folders/settings are up-to-date
    apiFetch<{ user: AdminUser }>(`/api/users/${uid}`)
      .then(data => setUsers(prev => prev.map(u => (u.uid || u.id) === uid ? { ...u, ...data.user } : u)))
      .catch(() => {});
  };

  const handleDeleteUser = async (uid: string) => {
    if (!window.confirm('Permanently delete this user and all their data?')) return;
    try {
      await apiFetch(`/api/users/${uid}`, { method: 'DELETE' });
      setUsers(prev => prev.filter(u => (u.uid || u.id) !== uid));
      setExpandedUser(null);
    } catch (err) {
      console.error('Delete user failed:', err);
      alert('Failed to delete user.');
    }
  };

  const handleDeleteHistory = async (uid: string) => {
    if (!window.confirm('Clear all sync history for this user?')) return;
    try {
      await apiFetch(`/api/users/${uid}/history`, { method: 'DELETE' });
      setSyncHistories(prev => ({ ...prev, [uid]: [] }));
    } catch (err) {
      console.error('Clear history failed:', err);
      alert('Failed to clear history.');
    }
  };

  if (adminUser === false) return <LoginForm onAuthenticated={() => { setAdminUser(true); void fetchUsers(); }} />;

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <RefreshCw className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  const usersWithToken = users.filter(u => u.fcmToken);

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-100 h-18 bg-white border-b border-slate-200 px-6 sm:px-12 flex items-center justify-between shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <div className="flex items-center gap-4">
          <div className="bg-slate-50 p-1.5 rounded-xl border border-slate-200">
            <Image src="/logo.png" alt="CloudSync" width={38} height={38} className="rounded-lg" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900 leading-none">
              CloudSync <span className="text-indigo-600">Admin</span>
            </h1>
            <p className="text-[0.6rem] text-slate-500 font-extrabold uppercase tracking-widest mt-1">
              v4.0.1 · CS Tech
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-5">
          <div className="hidden md:flex items-center gap-2.5 bg-emerald-50 px-4 py-2 rounded-full border border-emerald-100">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            <span className="text-xs font-extrabold text-emerald-600">System Online</span>
          </div>

          <button 
            onClick={() => setNotifyModal(true)} 
            title="Push Notification" 
            className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 cursor-pointer hover:bg-indigo-100 transition-colors"
          >
            <BellRing size={18} />
            {usersWithToken.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[0.6rem] font-extrabold w-4 h-4 rounded-full flex items-center justify-center border-2 border-white">
                {usersWithToken.length > 9 ? '9+' : usersWithToken.length}
              </span>
            )}
          </button>

          <button 
            onClick={() => fetch('/api/auth/otp', { method: 'DELETE' }).then(() => { setAdminUser(false); setUsers([]); })}
            className="flex items-center gap-2 px-4 py-2 md:py-2.5 rounded-xl bg-red-50 border border-red-100 text-red-600 cursor-pointer font-extrabold text-xs transition-colors hover:bg-red-100"
          >
            <LogOut size={16} /> <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      <main className="flex-1 w-full mx-auto px-4 sm:px-8 py-8 md:py-10">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <StatCard title="Total Users" value={stats.total} icon={Users} color="#6366f1" trend="+12%" sub="Across all platforms" />
          <StatCard title="Storage Used" value={stats.storage} icon={HardDrive} color="#10b981" sub="Global data synchronized" />
          <StatCard title="Sync Operations" value={stats.syncs.toLocaleString()} icon={ArrowUpRight} color="#8b5cf6" trend="+8.4%" sub="Total uploads processed" />
          <StatCard title="System Alerts" value={stats.alerts} icon={AlertCircle} color={stats.alerts > 0 ? COLORS.warning : COLORS.success} sub="Users near quota limit" />
        </div>

        {/* Tab Nav & Toolbar */}
        <div className="mb-6 flex flex-col md:flex-row gap-4 items-center justify-between p-2 md:pr-4 bg-white border border-slate-200 rounded-2xl shadow-sm sticky sm:relative top-20 sm:top-auto z-40 w-full overflow-hidden">
          
          <div className="flex gap-2 bg-slate-100 p-1.5 rounded-xl w-full md:w-auto overflow-x-auto">
            {(['users', 'subscriptions', 'overview', 'notifications'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-2.5 rounded-lg border-none cursor-pointer font-extrabold text-sm flex items-center gap-2 whitespace-nowrap transition-all ${
                  activeTab === tab
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'bg-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                }`}
              >
                {tab === 'notifications' && <Bell size={14} className={activeTab === tab ? "text-indigo-600" : "text-slate-400"} />}
                {tab === 'users' ? 'User Directory' : tab === 'subscriptions' ? '💳 Subscriptions' : tab === 'overview' ? 'Insights Data' : 'Notifications'}
              </button>
            ))}
          </div>

          {activeTab === 'notifications' && (
            <div className="w-full md:w-auto px-2 md:px-0 pb-2 md:pb-0">
              <button 
                onClick={() => setNotifyModal(true)} 
                className="w-full md:w-auto flex justify-center items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 border-none text-white font-extrabold text-sm cursor-pointer hover:bg-indigo-700 shadow-sm transition-all"
              >
                <Send size={14} /> Send Alert
              </button>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto px-2 md:px-0 pb-2 md:pb-0">
              <div className="relative w-full sm:w-60">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[0.85rem] text-slate-900 outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all font-semibold"
                  placeholder="Search identities..."
                  value={search} onChange={e => setSearch(e.target.value)} 
                />
              </div>
              <select 
                className="w-full sm:w-35 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[0.85rem] text-slate-700 outline-none focus:border-indigo-500 font-semibold cursor-pointer appearance-none"
                value={filterPlan} onChange={e => setFilterPlan(e.target.value)}
              >
                <option value="all">Plans: All</option>
                <option value="free">Free</option>
                <option value="yearly">Yearly</option>
                <option value="lifetime">Lifetime</option>
              </select>
              <select 
                className="w-full sm:w-35 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[0.85rem] text-slate-700 outline-none focus:border-indigo-500 font-semibold cursor-pointer appearance-none"
                value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              >
                <option value="all">Status: All</option>
                <option value="active">Active</option>
                <option value="blocked">Blocked</option>
              </select>
            </div>
          )}
        </div>

        <div className="animate-in fade-in zoom-in-95 duration-300">
          {activeTab === 'notifications' ? (
            <div className="mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900 leading-tight">Push History</h2>
                  <p className="text-xs text-slate-500 font-bold mt-1">Logs of all manually fired alerts</p>
                </div>
                <button
                  onClick={() => setNotifyModal(true)}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 border-none text-white font-extrabold text-sm cursor-pointer hover:bg-indigo-700 shadow-sm transition-all shadow-indigo-500/20"
                >
                  <Send size={15} /> Compose
                </button>
              </div>
              <NotificationHistory />
            </div>
          ) : activeTab === 'subscriptions' ? (
            <div>
              <div className="mb-8">
                <h2 className="text-xl font-extrabold text-slate-900 leading-tight">Subscription Management</h2>
                <p className="text-xs text-slate-500 font-bold mt-1">Manage user subscriptions, renewals, and billing</p>
              </div>
              <SubscriptionsTab />
            </div>
          ) : activeTab === 'users' ? (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm whitespace-nowrap">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
                      <th className="font-extrabold py-4 px-3 w-10 text-center">#</th>
                      <th className="font-extrabold py-4 px-4 w-70">User Profile</th>
                      <th className="font-extrabold py-4 px-4 w-40">Contact</th>
                      <th className="font-extrabold py-4 px-4">Tier</th>
                      <th className="font-extrabold py-4 px-4">Status</th>
                      <th className="font-extrabold py-4 px-4">Connectors</th>
                      <th className="font-extrabold py-4 px-4 w-45">Storage Used</th>
                      <th className="font-extrabold py-4 px-4">Files</th>
                      <th className="font-extrabold py-4 px-4">Dirs</th>
                      <th className="font-extrabold py-4 px-4">Registered</th>
                      <th className="font-extrabold py-4 px-4 text-right pr-6">Manage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <AnimatePresence>
                      {filteredUsers.map(u => {
                        const uid = u.uid || u.id;
                        const isExpanded = expandedUser === uid;
                        return (
                          <React.Fragment key={uid}>
                            <motion.tr
                              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                              className={`cursor-pointer transition-colors ${isExpanded ? 'bg-indigo-50/40 hover:bg-indigo-50/60' : 'hover:bg-slate-50'}`}
                              onClick={() => toggleExpand(uid)}
                            >
                              <td className="py-3 px-3 text-center align-middle">
                                {isExpanded ? <ChevronDown size={18} className="text-indigo-600 mx-auto" /> : <ChevronRight size={18} className="text-slate-400 mx-auto" />}
                              </td>
                              <td className="py-3 px-4 align-middle">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 font-extrabold text-sm">
                                    {(u.name || u.displayName || u.email || '?').charAt(0).toUpperCase()}
                                  </div>
                                  <div className="overflow-hidden">
                                    <p className="font-extrabold text-slate-900 text-[0.85rem] truncate">{u.name || u.displayName || 'Anonymous'}</p>
                                    <p className="text-[0.7rem] text-slate-500 truncate">{u.email}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-4 align-middle">
                                <span className={`text-[0.75rem] font-bold ${u.mobile ? 'text-indigo-600' : 'text-slate-400'}`}>{u.mobile || '—'}</span>
                              </td>
                              <td className="py-3 px-4 align-middle"><PlanBadge planKey={normalizePlanKey(u.plan)} /></td>
                              <td className="py-3 px-4 align-middle"><StatusBadge status={u.status || 'active'} /></td>
                              <td className="py-3 px-4 align-middle"><ProviderIcons user={u} /></td>
                              <td className="py-3 px-4 align-middle">
                                <div className="w-50"><QuotaBar used={u.uploadStats?.totalBytesUploaded || 0} planKey={normalizePlanKey(u.plan)} size="sm" /></div>
                              </td>
                              <td className="py-3 px-4 align-middle font-bold text-slate-700">{u.uploadStats?.syncCount || 0}</td>
                              <td className="py-3 px-4 align-middle font-bold text-slate-700">{u.settings?.folderPaths?.length || 0}</td>
                              <td className="py-3 px-4 align-middle text-[0.75rem] font-bold text-slate-500">{u.createdAt ? formatDate(u.createdAt, true) : u.lastLogin ? formatDate(u.lastLogin, true) : '—'}</td>
                              <td className="py-3 px-4 align-middle text-right pr-6">
                                <button
                                  onClick={e => { e.stopPropagation(); setPlanModal(u); }}
                                  className="inline-flex items-center justify-center p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-colors"
                                >
                                  <Settings size={15} />
                                </button>
                              </td>
                            </motion.tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan={11} className="p-0 border-b border-indigo-100/50">
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                  >
                                    <UserDetail
                                      user={u}
                                      history={syncHistories[uid] || []}
                                      onManagePlan={() => setPlanModal(u)}
                                      onDeleteHistory={() => handleDeleteHistory(uid)}
                                      onDeleteUser={() => handleDeleteUser(uid)}
                                    />
                                  </motion.div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </AnimatePresence>
                    {filteredUsers.length === 0 && (
                      <tr>
                        <td colSpan={11} className="py-16 text-center text-slate-500 font-bold">
                          No users found matching your filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <InsightsTab users={users} stats={stats} />
          )}
        </div>
      </main>

      <footer className="mt-8 border-t border-slate-200 py-6 text-center text-[0.75rem] font-bold text-slate-400">
        © 2026 CloudSync by CSTeam. All rights reserved. <br className="sm:hidden" />
      </footer>

      {planModal && <PlanModal user={planModal} onClose={() => setPlanModal(null)} onSave={fetchUsers} />}
      <AnimatePresence>
        {notifyModal && <SendNotificationModal users={users} onClose={() => setNotifyModal(false)} />}
      </AnimatePresence>
    </div>
  );
}
