import type { SubscriptionService } from './SubscriptionService';
let service: SubscriptionService | undefined;
export function configureSubscriptionService(value: SubscriptionService) { service = value; }
export function getSubscriptionService(): SubscriptionService {
  if (!service) throw new Error('Subscription service has not been configured at the application boundary.');
  return service;
}
