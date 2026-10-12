import { useCallback } from 'react';
import type { SubscriptionInfoResponse } from '~/app/types/subscriptions';
import { getSubscriptionService } from '~/services/subscriptions/configuredService';
import { useServiceData } from '~/shared/hooks/useServiceData';
export const useGetSubscriptionInfo = (name: string) => {
  const request = useCallback(()=>getSubscriptionService().getInfo(name),[name]);
  return useServiceData<SubscriptionInfoResponse | null>(request,null,0);
};
