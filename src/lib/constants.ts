import {
  HardDrive, Mail, Cloud, Globe,
} from 'lucide-react';
import {
  getPlan,
  normalizePlanKey,
  PLAN_OPTIONS,
  PLANS as BILLING_PLANS,
  PLAN_ORDER,
} from './billing';

// ─── Color constants ──────────────────────────────────────────────────────────

export const COLORS = {
  primary: '#6366f1',
  primaryGlow: 'rgba(99, 102, 241, 0.4)',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  textMuted: '#94a3b8',
  textDim: '#64748b',
};

// ─── Plans ────────────────────────────────────────────────────────────────────

export const PLANS = BILLING_PLANS;
export { PLAN_ORDER, PLAN_OPTIONS, getPlan, normalizePlanKey };

// ─── Providers ────────────────────────────────────────────────────────────────

export const PROVIDERS: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  gmail: { color: '#ef4444', icon: Mail, label: 'Google' },
  google: { color: '#ef4444', icon: Mail, label: 'Google' },
  google_drive: { color: '#34a853', icon: HardDrive, label: 'Drive' },
  onedrive: { color: '#0078d4', icon: Cloud, label: 'OneDrive' },
  dropbox: { color: '#0061ff', icon: HardDrive, label: 'Dropbox' },
  ftp: { color: '#f59e0b', icon: Globe, label: 'FTP' },
};

export function getProviderInfo(p = ''): { color: string; icon: React.ElementType; label: string } {
  if (!p) return { color: '#94a3b8', icon: HardDrive, label: 'Unknown' };
  const key = p.toLowerCase();
  if (key.includes('google')) return PROVIDERS.google_drive;
  return PROVIDERS[key] || { color: '#94a3b8', icon: HardDrive, label: p };
}

// ─── Formatters ───────────────────────────────────────────────────────────────

export function formatBytes(bytes: number | undefined | null): string {
  if (!bytes || bytes === 0) return '0 B';
  if (!isFinite(bytes)) return 'Unlimited';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatDate(ts: number | string | undefined | null, showTime = false): string {
  if (!ts) return '—';
  const d = typeof ts === 'string' ? new Date(ts) : new Date(ts);
  if (isNaN(d.getTime())) return '—';
  const dateOpts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  if (!showTime) return d.toLocaleDateString(undefined, dateOpts);
  return d.toLocaleString(undefined, { ...dateOpts, hour: '2-digit', minute: '2-digit', hour12: true });
}

export function quotaUsedPct(used: number, planKey: string): number {
  const plan = getPlan(planKey);
  if (!isFinite(plan.quota)) return 0;
  return Math.min(100, ((used || 0) / plan.quota) * 100);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  uid?: string;
  name?: string;
  displayName?: string;
  email?: string;
  mobile?: string;
  plan?: string;
  status?: string;
  fcmToken?: string;
  loginProfile?: string;
  activeSyncCloud?: string;
  connectedProviders?: string[];
  lastLogin?: number;
  createdAt?: number;
  planExpiresAt?: number;
  billing?: {
    provider?: string;
    purchaseType?: string;
    productId?: string;
    purchaseToken?: string;
    orderId?: string;
    status?: string;
    planKey?: string;
    expiryAt?: number;
    verifiedAt?: number;
    lastSyncedAt?: number;
  };
  uploadStats?: {
    totalBytesUploaded?: number;
    syncCount?: number;
  };
  settings?: {
    autoSync?: boolean;
    wifiOnly?: boolean;
    downloadSync?: boolean;
    folderPaths?: string[];
    fileTypeFilter?: string;
    syncIntervalMinutes?: number;
    deviceId?: string;
  };
  deviceInfo?: {
    manufacturer?: string;
    model?: string;
    brand?: string;
    androidVersion?: string;
    sdkInt?: number;
  };
  appInfo?: {
    versionName?: string;
    versionCode?: number;
    packageName?: string;
  };
  syncData?: {
    folders?: string[];
    totalSizeBytes?: number;
  };
}

export interface SyncHistoryEntry {
  id: string;
  cloudProvider?: string;
  timestamp?: number;
  bytesPushed?: number;
  filesPushed?: number;
}

export interface NotificationLog {
  id: string;
  title: string;
  body: string;
  target: string;
  targetPlan?: string;
  targetUserId?: string;
  notificationType?: string;
  redirectUrl?: string;
  imageUrl?: string;
  sentCount: number;
  failedCount: number;
  totalTargeted: number;
  sentAt?: number; // epoch milliseconds, serialized by backend
}
