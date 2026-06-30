import { NextRequest, NextResponse } from 'next/server';
import { connectDb } from '@/lib/mongoose';
import { Subscription } from '@/lib/models/Subscription';
import { User } from '@/lib/models/User';
import { verifyToken, unauthorized, serverError, badRequest } from '@/lib/auth-server';
import { normalizePlanKey } from '@/lib/billing';
import { logger } from '@/lib/logger';

// PATCH /api/subscriptions/[id] — update subscription status and renewal details
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyToken(req);
    const { id } = await params;
    const body = await req.json();
    await connectDb();

    if (!id) return badRequest('Subscription ID is required');

    const { status, renewalDate, autoRenew, paymentMethod, action } = body;

    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (renewalDate) updateData.renewalDate = parseInt(renewalDate);
    if (autoRenew !== undefined) updateData.autoRenew = autoRenew;
    if (paymentMethod) updateData.paymentMethod = paymentMethod;

    if (action === 'cancel' || action === 'refund' || status === 'inactive') {
      const subDoc = await Subscription.findOne({ purchaseToken: id }).lean() as any;
      if (subDoc) {
        if (subDoc.paymentMethod === 'google_play') {
          const { refundAndRevokeGooglePlaySubscription, cancelGooglePlaySubscription } = await import('@/lib/google-play');
          try {
            if (action === 'cancel') {
              if (subDoc.billingCycle === 'lifetime') {
                return badRequest('One-time purchases cannot be canceled. Use refund instead.');
              }
              await cancelGooglePlaySubscription(id);
              logger.info('Google Play subscription auto-renewal stopped', { id });
              updateData.autoRenew = false;
              updateData.status = 'canceled';
            } else {
              await refundAndRevokeGooglePlaySubscription(id);
              logger.info('Google Play subscription revoked and refunded', { id });
              updateData.autoRenew = false;
              updateData.status = 'revoked';
            }
          } catch (apiError) {
            logger.error('Failed to perform Google Play action', { action, error: apiError instanceof Error ? apiError.message : String(apiError) });
            return badRequest(`Failed to communicate with Google Play: ${apiError instanceof Error ? apiError.message : 'Unknown'}`);
          }
        }
      }
    }

    if (Object.keys(updateData).length === 0) return badRequest('No fields to update');

    updateData.updatedAt = Date.now();
    await Subscription.findOneAndUpdate({ purchaseToken: id }, { $set: updateData });
    logger.info('Subscription updated', { id, changes: Object.keys(updateData) });

    // Sync plan back to users collection
    const subDoc = await Subscription.findOne({ purchaseToken: id }).lean() as any;
    if (subDoc?.userId) {
      const isRevoked = updateData.status === 'revoked' || updateData.status === 'canceled';
      const isActive = updateData.status === 'active';
      const newPlan = isRevoked ? 'free' : (isActive && subDoc.planType ? normalizePlanKey(subDoc.planType as string) : undefined);
      if (newPlan) {
        await User.findOneAndUpdate(
          { uid: subDoc.userId },
          { $set: { plan: newPlan, 'billing.status': updateData.status } }
        );
        logger.info('User plan synced from subscription update', { userId: subDoc.userId, plan: newPlan });
      }
    }

    return NextResponse.json({ success: true, message: 'Subscription updated' });
  } catch (err) {
    logger.error('Error updating subscription', { error: err instanceof Error ? err.message : 'Unknown Error' });
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    return serverError(err);
  }
}

// DELETE /api/subscriptions/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyToken(req);
    const { id } = await params;
    await connectDb();

    if (!id) return badRequest('Subscription ID is required');

    await Subscription.deleteOne({ purchaseToken: id });
    logger.info('Subscription deleted', { id });
    return NextResponse.json({ success: true, message: 'Subscription deleted' });
  } catch (err) {
    logger.error('Error deleting subscription', { error: err instanceof Error ? err.message : 'Unknown Error' });
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    return serverError(err);
  }
}
