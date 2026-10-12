// Compatibility adapter retaining upstream call signatures while replacing transport.
import type { CreateSubscriptionRequest, UpdateSubscriptionRequest } from '~/app/types/subscriptions';
import type { APIOptions } from '~/shared/api';
import { getSubscriptionService } from '~/services/subscriptions/configuredService';
export const createSubscription = () => (_opts: APIOptions,input: CreateSubscriptionRequest) => getSubscriptionService().create(input);
export const updateSubscription = () => (_opts: APIOptions,name: string,input: UpdateSubscriptionRequest,revision: string) => getSubscriptionService().update(name,input,revision);
