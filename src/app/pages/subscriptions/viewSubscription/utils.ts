// Adapted from opendatahub-io/odh-dashboard
// packages/maas/frontend/src/app/pages/subscriptions/viewSubscription/utils.ts
// upstream commit: 8051fbbea117457b4da4074fb2856b732e6677a4
import { ModelSubscriptionRef } from '~/app/types/subscriptions';
import { formatTokenRateLimitLine } from '~/app/utilities/rateLimits';

export const formatTokenLimits = (
  modelRefs: ModelSubscriptionRef[],
  name: string,
): string[] => {
  const ref = modelRefs.find((r) => r.name === name);
  const limits = ref && Array.isArray(ref.tokenRateLimits) ? ref.tokenRateLimits : [];
  return limits.map(({ limit, window }) => formatTokenRateLimitLine(limit, window));
};
