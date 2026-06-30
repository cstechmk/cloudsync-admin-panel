import { NextRequest, NextResponse } from 'next/server';
import { connectDb, serializeMongoData } from '@/lib/mongoose';
import { Subscription } from '@/lib/models/Subscription';
import { verifyToken, unauthorized, serverError } from '@/lib/auth-server';
import { logger } from '@/lib/logger';
import { getUsdRates, convertToUsd } from '@/lib/exchange-rates';

// GET /api/subscriptions — list all subscriptions with stats
export async function GET(req: NextRequest) {
  try {
    await verifyToken(req);
    await connectDb();
    logger.info('Fetching subscriptions');

    const docs = await Subscription.find({}).sort({ renewalDate: -1 }).lean();
    const subscriptions = docs.map(serializeMongoData);

    const activeStatuses = ['active', 'canceled'];
    const usdRates = await getUsdRates();

    function revenueByBillingCycle(cycle: string) {
      const relevant = subscriptions.filter(
        (s: any) => s.billingCycle === cycle && activeStatuses.includes(s.status)
      );
      const byCurrency = relevant.reduce((acc: Record<string, number>, s: any) => {
        const currency = (s.currency || 'USD').toUpperCase();
        acc[currency] = (acc[currency] || 0) + (s.amount || 0);
        return acc;
      }, {} as Record<string, number>);

      const totalUsd = relevant.reduce((sum: number, s: any) => {
        return sum + convertToUsd(s.amount || 0, s.currency || 'USD', usdRates);
      }, 0);

      return { byCurrency, totalUsd };
    }

    const yearlyRevenue = revenueByBillingCycle('yearly');
    const monthlyRevenue = revenueByBillingCycle('monthly');
    const lifetimeRevenue = revenueByBillingCycle('lifetime');

    const stats = {
      total: subscriptions.length,
      active: subscriptions.filter((s: any) => s.status === 'active').length,
      inactive: subscriptions.filter((s: any) => s.status === 'inactive').length,
      expiring_soon: subscriptions.filter((s: any) => s.status === 'expiring_soon').length,
      expired: subscriptions.filter((s: any) => s.status === 'expired').length,
      monthlyRevenue: monthlyRevenue.byCurrency,
      yearlyRevenue: yearlyRevenue.byCurrency,
      lifetimeRevenue: lifetimeRevenue.byCurrency,
      totalRevenueUsd: yearlyRevenue.totalUsd + monthlyRevenue.totalUsd + lifetimeRevenue.totalUsd,
    };

    logger.info('Subscriptions fetch complete', { count: subscriptions.length });
    return NextResponse.json({ subscriptions, stats });
  } catch (err) {
    logger.error('Error fetching subscriptions', { error: err instanceof Error ? err.message : 'Unknown Error' });
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    return serverError(err);
  }
}
