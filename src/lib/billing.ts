import type { ElementType } from 'react';
import { Crown, Star } from 'lucide-react';

export type PlanKey = 'free' | 'yearly' | 'lifetime';
export type PurchaseType = 'subscription' | 'one_time';

export interface PlanConfig {
  label: string;
  quota: number;
  color: string;
  icon: ElementType;
  price: string;
  amount: number;
  currency: string;
  billingKind: PurchaseType | 'none';
  termLabel?: string;
  productIdEnv?: string;
}

const GIB = 1024 * 1024 * 1024;

export const PLAN_ORDER: PlanKey[] = ['free', 'yearly', 'lifetime'];

export const PLAN_ALIASES: Record<string, PlanKey> = {
  pro: 'yearly',
  business: 'yearly',
};

export const PLANS: Record<PlanKey, PlanConfig> = {
  free: {
    label: 'Free',
    quota: 1 * GIB,
    color: '#94a3b8',
    icon: Star,
    price: '₹0',
    amount: 0,
    currency: 'INR',
    billingKind: 'none',
  },
  yearly: {
    label: 'Yearly',
    quota: Infinity,
    color: '#6366f1',
    icon: Crown,
    price: '₹10/year',
    amount: 10,
    currency: 'INR',
    billingKind: 'subscription',
    termLabel: '1 year',
    productIdEnv: 'GOOGLE_PLAY_YEARLY_PRODUCT_ID',
  },
  lifetime: {
    label: 'Lifetime',
    quota: Infinity,
    color: '#8b5cf6',
    icon: Crown,
    price: '₹4999',
    amount: 4999,
    currency: 'INR',
    billingKind: 'one_time',
    termLabel: 'Lifetime',
    productIdEnv: 'GOOGLE_PLAY_LIFETIME_PRODUCT_ID',
  },
};

export interface PlanOption {
  key: PlanKey;
  label: string;
  quota: number;
  color: string;
  icon: ElementType;
  price: string;
  amount: number;
  currency: string;
  termLabel?: string;
  billingKind: PlanConfig['billingKind'];
}

export const PLAN_OPTIONS: PlanOption[] = PLAN_ORDER.map(key => {
  const plan = PLANS[key];
  return {
    key,
    label: plan.label,
    quota: plan.quota,
    color: plan.color,
    icon: plan.icon,
    price: plan.price,
    amount: plan.amount,
    currency: plan.currency,
    termLabel: plan.termLabel,
    billingKind: plan.billingKind,
  };
});

export function normalizePlanKey(plan?: string | null): PlanKey {
  const key = (plan || 'free').toLowerCase();
  if (key in PLANS) return key as PlanKey;
  return PLAN_ALIASES[key] || 'free';
}

export function getPlan(plan?: string | null): PlanConfig {
  return PLANS[normalizePlanKey(plan)];
}

export function formatPlanQuota(plan?: string | null): string {
  return getPlan(plan).label;
}

export function resolvePlanFromProductId(productId?: string | null): PlanKey | null {
  if (!productId) return null;

  // 1. Exact match against configured Google Play product IDs
  for (const key of PLAN_ORDER) {
    const envName = PLANS[key].productIdEnv;
    if (!envName) continue;
    const configured = process.env[envName];
    if (configured && configured === productId) return key as PlanKey;
  }

  // 2. Exact match against configured Apple App Store product IDs
  //    (stored in APPLE_YEARLY_PRODUCT_ID / APPLE_LIFETIME_PRODUCT_ID env vars)
  if (process.env.APPLE_YEARLY_PRODUCT_ID === productId) return 'yearly';
  if (process.env.APPLE_LIFETIME_PRODUCT_ID === productId) return 'lifetime';

  // 3. Pattern-based fallback — handles any bundle ID convention that
  //    contains the tier name (e.g. "com.acme.app.lifetime", "app.yearly")
  const lower = productId.toLowerCase();
  if (lower.includes('lifetime')) return 'lifetime';
  if (lower.includes('yearly') || lower.includes('annual')) return 'yearly';

  return null;
}

export function getConfiguredProductIds() {
  return PLAN_ORDER.reduce<Record<PlanKey, string | undefined>>((acc, key) => {
    const envName = PLANS[key].productIdEnv;
    acc[key] = envName ? process.env[envName] : undefined;
    return acc;
  }, {} as Record<PlanKey, string | undefined>);
}

/** Returns true if newPlan is strictly higher tier than currentPlan. */
export function isPlanUpgrade(currentPlan: string | null | undefined, newPlan: PlanKey): boolean {
  const currentIdx = PLAN_ORDER.indexOf(normalizePlanKey(currentPlan));
  const newIdx = PLAN_ORDER.indexOf(newPlan);
  return newIdx > currentIdx;
}

/** Returns true only if it is safe to write newPlan to the user record.
 *  Rule: never overwrite a higher-tier plan with a lower one, regardless of source.
 *  (Yearly must not overwrite Lifetime whether from a webhook or a client verify.) */
export function canOverwritePlan(currentPlan: string | null | undefined, newPlan: PlanKey, _source: string): boolean {
  const normalized = normalizePlanKey(currentPlan);
  return PLAN_ORDER.indexOf(newPlan) >= PLAN_ORDER.indexOf(normalized);
}
