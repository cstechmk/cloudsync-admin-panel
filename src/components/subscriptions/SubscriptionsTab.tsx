'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronDown,
  Download,
  Trash2,
  Copy,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatDate, formatBytes } from '@/lib/constants';

function formatCurrency(amount: number, currency: string): string {
  const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : currency + ' ';
  return `${symbol}${amount.toFixed(2)}`;
}

function formatRevenueByCurrency(revenue: Record<string, number>): string {
  const entries = Object.entries(revenue).filter(([, v]) => v > 0);
  if (entries.length === 0) return '$0.00';
  return entries
    .map(([currency, amount]) => formatCurrency(amount, currency))
    .join(' + ');
}

export interface Subscription {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  planType: 'free' | 'monthly' | 'yearly' | 'lifetime';
  status: 'active' | 'inactive' | 'expiring_soon' | 'expired' | 'canceled' | 'pending' | 'revoked';
  startDate: number;
  renewalDate: number;
  nextBillingDate: number;
  lastPaymentDate: number;
  paymentMethod: string;
  amount: number;
  currency: string;
  autoRenew: boolean;
  billingCycle: 'monthly' | 'yearly' | 'lifetime';
  notificationsSent: number;
  orderId?: string | null;
  purchaseToken?: string | null;
}

type RevenueByCurrency = Record<string, number>;

interface SubscriptionStats {
  total: number;
  active: number;
  inactive: number;
  expiring_soon: number;
  expired: number;
  monthlyRevenue: RevenueByCurrency;
  yearlyRevenue: RevenueByCurrency;
  lifetimeRevenue: RevenueByCurrency;
  totalRevenueUsd: number;
}

function StatBadge({
  label,
  value,
  count,
  color,
  prefix,
}: {
  label: string;
  value: string | number;
  count?: number;
  color: string;
  prefix?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative px-6 py-4 rounded-2xl border-2 ${color} overflow-hidden`}
    >
      <div className="absolute inset-0 opacity-5 bg-gradient-to-br from-white to-gray-900" />
      <div className="relative">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-1">
          {label}
        </p>
        <div className="flex items-baseline gap-2">
          <p className="text-3xl font-black">{prefix}{value}</p>
          {count !== undefined && (
            <span className="text-xs font-bold text-gray-500">({count} users)</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function StatusBadge({ status }: { status: Subscription['status'] }) {
  const badges: Record<string, any> = {
    active: {
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      text: 'text-emerald-700',
      icon: CheckCircle,
      label: 'Active',
    },
    inactive: {
      bg: 'bg-slate-50',
      border: 'border-slate-200',
      text: 'text-slate-600',
      icon: XCircle,
      label: 'Inactive',
    },
    expiring_soon: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-700',
      icon: AlertCircle,
      label: 'Expiring Soon',
    },
    expired: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-700',
      icon: XCircle,
      label: 'Expired',
    },
    canceled: {
      bg: 'bg-indigo-50',
      border: 'border-indigo-200',
      text: 'text-indigo-700',
      icon: Clock,
      label: 'Canceled (Active until expiry)',
    },
    revoked: {
      bg: 'bg-slate-100',
      border: 'border-slate-300',
      text: 'text-slate-500',
      icon: XCircle,
      label: 'Revoked (Refunded)',
    },
    pending: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-700',
      icon: Clock,
      label: 'Pending',
    },
  };

  const badge = badges[status] || badges.inactive;
  const Icon = badge.icon;

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${badge.bg} ${badge.border} ${badge.text} text-xs font-bold`}>
      <Icon size={14} />
      {badge.label}
    </div>
  );
}

function SubscriptionRow({
  subscription,
  isExpanded,
  onToggle,
  onStatusChange,
  onDelete,
}: {
  subscription: Subscription;
  isExpanded: boolean;
  onToggle: () => void;
  onStatusChange: (id: string, options: { action?: 'cancel' | 'refund'; status?: string }) => void;
  onDelete: (id: string) => void;
}) {
  const daysUntilRenewal = Math.ceil((subscription.renewalDate - Date.now()) / (1000 * 60 * 60 * 24));
  const isExpiringSoon = daysUntilRenewal <= 7 && daysUntilRenewal > 0;

  return (
    <>
      <motion.tr
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={`cursor-pointer transition-colors ${
          isExpanded ? 'bg-indigo-50/30' : 'hover:bg-slate-50'
        } border-b border-slate-100`}
        onClick={onToggle}
      >
        <td className="py-4 px-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-8 h-8 flex items-center justify-center rounded-lg font-bold text-white text-sm ${
                subscription.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400'
              }`}
            >
              {subscription.userName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm">{subscription.userName}</p>
              <p className="text-xs text-slate-500">{subscription.userEmail}</p>
              <button
                onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(subscription.id); }}
                className="flex items-center gap-1 mt-0.5 text-[10px] text-slate-400 font-mono hover:text-indigo-500 transition-colors"
                title="Copy subscription ID"
              >
                <Copy size={10} />
                {subscription.id.length > 20 ? subscription.id.slice(0, 20) + '…' : subscription.id}
              </button>
              {subscription.orderId && (
                <button
                  onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(subscription.orderId!); }}
                  className="flex items-center gap-1 mt-0.5 text-[10px] text-slate-500 font-mono hover:text-indigo-500 transition-colors"
                  title="Copy Order ID"
                >
                  <Copy size={10} />
                  {subscription.orderId}
                </button>
              )}
            </div>
          </div>
        </td>

        <td className="py-4 px-4">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-100">
              {subscription.planType.charAt(0).toUpperCase() + subscription.planType.slice(1)}
            </span>
            <span className="text-xs text-slate-500">
              {subscription.billingCycle === 'yearly' ? '📅 Yearly' : subscription.billingCycle === 'lifetime' ? '♾️ Lifetime' : '📆 Monthly'}
            </span>
          </div>
        </td>

        <td className="py-4 px-4">
          <StatusBadge status={subscription.status} />
        </td>

        <td className="py-4 px-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Calendar size={14} className="text-indigo-600" />
              {subscription.billingCycle === 'lifetime' ? '∞ Permanent' : formatDate(subscription.renewalDate)}
            </div>
            {isExpiringSoon && subscription.billingCycle !== 'lifetime' && (
              <span className="text-xs text-amber-600 font-bold">
                ⏰ {daysUntilRenewal} days left
              </span>
            )}
          </div>
        </td>

        <td className="py-4 px-4">
          <div className="text-right">
            <p className="font-bold text-slate-900">
              {formatCurrency(subscription.amount, subscription.currency)}
            </p>
            <p className="text-xs text-slate-500">{subscription.currency}</p>
          </div>
        </td>

        <td className="py-4 px-4">
          <div className="flex flex-col gap-2">
            {/* Action 1: Stop Auto-Renew */}
            {subscription.status === 'active' && subscription.autoRenew && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Stop auto-renewal for ${subscription.userName}? They will keep access until ${formatDate(subscription.renewalDate)} but won't be charged again.`)) {
                    onStatusChange(subscription.id, { action: 'cancel' });
                  }
                }}
                className="flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg font-bold text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-all"
              >
                <Clock size={14} />
                Stop Auto-Renew
              </button>
            )}

            {/* Action 2: Refund & Revoke */}
            {(subscription.status === 'active' || subscription.status === 'canceled' || subscription.status === 'expiring_soon') && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm('⚠️ REFUND WARNING: This will immediately REFUND the user and REVOKE their access in Google Play. Are you sure?')) {
                    onStatusChange(subscription.id, { action: 'refund' });
                  }
                }}
                className="flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg font-bold text-xs bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-all"
              >
                <XCircle size={14} />
                Refund & Revoke
              </button>
            )}

            {/* Fallback/Re-enable if inactive */}
            {(subscription.status === 'inactive' || subscription.status === 'revoked' || subscription.status === 'expired') && (
              <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase text-center py-1">
                No Actions Available
              </span>
            )}
          </div>
        </td>

        <td className="py-4 px-4 text-right">
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            className="flex justify-end"
          >
            <ChevronDown size={18} className="text-slate-400" />
          </motion.div>
        </td>
      </motion.tr>

      <AnimatePresence>
        {isExpanded && (
          <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="border-b border-slate-100 bg-indigo-50/20"
          >
            <td colSpan={7} className="p-6">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
              >
                {/* Subscription Details */}
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <h4 className="text-xs font-bold uppercase text-slate-500 mb-4 tracking-widest">
                    Subscription Details
                  </h4>
                  <div className="space-y-3">
                    {subscription.orderId && (
                      <div>
                        <p className="text-xs text-slate-500 font-bold mb-1">Order ID</p>
                        <button
                          onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(subscription.orderId!); }}
                          className="flex items-center gap-1.5 text-xs font-mono text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1 hover:bg-indigo-100 transition-colors"
                          title="Copy Order ID"
                        >
                          <Copy size={11} />
                          {subscription.orderId}
                        </button>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-slate-500 font-bold mb-1">Start Date</p>
                      <p className="text-sm font-bold text-slate-900">
                        {formatDate(subscription.startDate, true)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-bold mb-1">Auto-Renew</p>
                      <p className="text-sm font-bold text-slate-900">
                        {subscription.autoRenew ? '✅ Enabled' : '❌ Disabled'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-bold mb-1">Cycle</p>
                      <p className="text-sm font-bold text-slate-900 capitalize">
                        {subscription.billingCycle}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Billing Information */}
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <h4 className="text-xs font-bold uppercase text-slate-500 mb-4 tracking-widest">
                    Billing Info
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-slate-500 font-bold mb-1">Payment Method</p>
                      <p className="text-sm font-bold text-slate-900">
                        {subscription.paymentMethod || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-bold mb-1">Last Payment</p>
                      <p className="text-sm font-bold text-slate-900">
                        {formatDate(subscription.lastPaymentDate, true)}
                      </p>
                    </div>
                    {subscription.billingCycle !== 'lifetime' && (
                      <div>
                        <p className="text-xs text-slate-500 font-bold mb-1">Next Billing</p>
                        <p className="text-sm font-bold text-emerald-600">
                          {formatDate(subscription.nextBillingDate, true)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Revenue & Stats */}
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <h4 className="text-xs font-bold uppercase text-slate-500 mb-4 tracking-widest">
                    Transaction History
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-slate-500 font-bold mb-1">Amount</p>
                      <p className="text-sm font-bold text-slate-900">
                        {formatCurrency(subscription.amount, subscription.currency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-bold mb-1">Currency</p>
                      <p className="text-sm font-bold text-slate-900">
                        {subscription.currency}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-bold mb-1">Notifications Sent</p>
                      <p className="text-sm font-bold text-slate-900">
                        {subscription.notificationsSent}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <h4 className="text-xs font-bold uppercase text-slate-500 mb-4 tracking-widest">
                    Quick Actions
                  </h4>
                  <div className="space-y-2">
                    <button disabled className="w-full px-3 py-2 bg-indigo-50 text-indigo-300 border border-indigo-100 rounded-lg font-bold text-xs cursor-not-allowed">
                      📧 Send Renewal Notice
                    </button>
                    <button disabled className="w-full px-3 py-2 bg-amber-50 text-amber-300 border border-amber-100 rounded-lg font-bold text-xs cursor-not-allowed">
                      🔄 Update Renewal Date
                    </button>
                    <button disabled className="w-full px-3 py-2 bg-slate-50 text-slate-300 border border-slate-100 rounded-lg font-bold text-xs cursor-not-allowed">
                      📥 Download Invoice
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        if (window.confirm(`Delete subscription record "${subscription.id}"? This only removes the data entry — it does NOT revoke access in Google Play.`)) {
                          onDelete(subscription.id);
                        }
                      }}
                      className="w-full px-3 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg font-bold text-xs hover:bg-red-100 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Trash2 size={12} />
                      Delete Record
                    </button>
                  </div>
                </div>
              </motion.div>
            </td>
          </motion.tr>
        )}
      </AnimatePresence>
    </>
  );
}

export function SubscriptionsTab() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [stats, setStats] = useState<SubscriptionStats>({
    total: 0,
    active: 0,
    inactive: 0,
    expiring_soon: 0,
    expired: 0,
    monthlyRevenue: {},
    yearlyRevenue: {},
    lifetimeRevenue: {},
    totalRevenueUsd: 0,
  });

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | Subscription['status']>('all');
  const [filterPlan, setFilterPlan] = useState<'all' | Subscription['planType']>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSubscriptions = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const data = await apiFetch<{ subscriptions: Subscription[]; stats: SubscriptionStats }>(
          '/api/subscriptions'
        );
        setSubscriptions(data.subscriptions);
        setStats(data.stats);
      } catch (err: any) {
        console.error('Failed to load subscriptions:', err);
        if (err?.message?.includes('RESOURCE_EXHAUSTED') || err?.message?.includes('Quota')) {
          console.warn('Backend API quota exceeded or rate limited.');
        }
      } finally {
        setLoading(false);
      }
    };

    setLoading(true);
    void fetchSubscriptions();
    const interval = setInterval(fetchSubscriptions, 300000);
    const onVisible = () => { if (document.visibilityState === 'visible') void fetchSubscriptions(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  const filteredSubscriptions = useMemo(() => {
    return subscriptions.filter(sub => {
      const matchSearch =
        !search ||
        sub.userName.toLowerCase().includes(search.toLowerCase()) ||
        sub.userEmail.toLowerCase().includes(search.toLowerCase());
      const matchStatus = filterStatus === 'all' || sub.status === filterStatus;
      const matchPlan = filterPlan === 'all' || sub.planType === filterPlan;
      return matchSearch && matchStatus && matchPlan;
    });
  }, [subscriptions, search, filterStatus, filterPlan]);

  const handleExport = () => {
    if (filteredSubscriptions.length === 0) return;
    const headers = ['Name', 'Email', 'Plan', 'Status', 'Amount', 'Currency', 'Billing Cycle', 'Renewal Date', 'Auto Renew'];
    const csv = [
      headers.join(','),
      ...filteredSubscriptions.map(s => [
        `"${s.userName}"`,
        `"${s.userEmail}"`,
        s.planType,
        s.status,
        s.amount,
        s.currency,
        s.billingCycle,
        s.renewalDate ? new Date(s.renewalDate).toISOString().split('T')[0] : '',
        s.autoRenew ? 'Yes' : 'No',
      ].join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `subscriptions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteSubscription = async (id: string) => {
    try {
      await apiFetch(`/api/subscriptions/${id}`, { method: 'DELETE' });
      setSubscriptions(prev => prev.filter(s => s.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (err) {
      console.error('Failed to delete subscription:', err);
      alert('Failed to delete subscription record');
    }
  };

  const handleSubscriptionAction = async (id: string, options: { action?: 'cancel' | 'refund'; status?: string }) => {
    try {
      const body: Record<string, any> = {};
      if (options.action) body.action = options.action;
      if (options.status) body.status = options.status;

      await apiFetch(`/api/subscriptions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });

      // Refresh data to show changes
      const data = await apiFetch<{ subscriptions: Subscription[]; stats: SubscriptionStats }>(
        '/api/subscriptions'
      );
      setSubscriptions(data.subscriptions);
      setStats(data.stats);
    } catch (err) {
      console.error('Failed to update subscription:', err);
      alert('Failed to perform subscription action');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Dashboard Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatBadge
          label="Total Active"
          value={stats.active}
          count={stats.active}
          color="bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200"
        />
        <StatBadge
          label="Expiring Soon"
          value={stats.expiring_soon}
          count={stats.expiring_soon}
          color="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200"
        />
        <StatBadge
          label="Inactive"
          value={stats.inactive}
          count={stats.inactive}
          color="bg-gradient-to-br from-slate-50 to-gray-50 border-slate-200"
        />
        <StatBadge
          label="Total Revenue (≈ USD)"
          value={`$${stats.totalRevenueUsd.toFixed(2)}`}
          color="bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200"
        />
      </div>

      {/* Controls & Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
          <div className="relative flex-1 max-w-xs">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all font-semibold"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as any)}
              className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 outline-none focus:border-indigo-500 font-semibold cursor-pointer"
            >
              <option value="all">Status: All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="expiring_soon">Expiring Soon</option>
              <option value="expired">Expired</option>
               <option value="canceled">Canceled (Active)</option>
              <option value="revoked">Revoked (Refunded)</option>
              <option value="pending">Pending</option>
            </select>

            <select
              value={filterPlan}
              onChange={e => setFilterPlan(e.target.value as any)}
              className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 outline-none focus:border-indigo-500 font-semibold cursor-pointer"
            >
              <option value="all">Plans: All</option>
              <option value="free">Free</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
              <option value="lifetime">Lifetime</option>
            </select>

            <button onClick={handleExport} className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2">
              <Download size={16} />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </div>
      </div>

      {/* Subscriptions Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-8">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center gap-6">
           <div className="flex items-center gap-2 text-[10px] uppercase font-black tracking-widest text-slate-500">
             <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
             Active: Auto-renewing
           </div>
           <div className="flex items-center gap-2 text-[10px] uppercase font-black tracking-widest text-slate-500">
             <div className="w-2.5 h-2.5 rounded-full bg-indigo-500"></div>
             Canceled: Ends at Expiry
           </div>
           <div className="flex items-center gap-2 text-[10px] uppercase font-black tracking-widest text-slate-500">
             <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
             Revoked: Refunded & Closed
           </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-slate-50/80 text-slate-500 border-b border-slate-200">
                <th className="font-extrabold py-4 px-4">User</th>
                <th className="font-extrabold py-4 px-4">Plan</th>
                <th className="font-extrabold py-4 px-4">Status</th>
                <th className="font-extrabold py-4 px-4">Renewal Date</th>
                <th className="font-extrabold py-4 px-4">Amount</th>
                <th className="font-extrabold py-4 px-4">Control</th>
                <th className="font-extrabold py-4 px-4">More</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {filteredSubscriptions.length > 0 ? (
                  filteredSubscriptions.map(sub => (
                    <SubscriptionRow
                      key={sub.id}
                      subscription={sub}
                      isExpanded={expandedId === sub.id}
                      onToggle={() => setExpandedId(expandedId === sub.id ? null : sub.id)}
                      onStatusChange={handleSubscriptionAction}
                      onDelete={handleDeleteSubscription}
                    />
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-slate-500 font-bold">
                      No subscriptions found matching your filters.
                    </td>
                  </tr>
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
