import { z } from 'zod';
import { modelSummarySchema } from './subscriptions';
import { ServiceError } from '~/services/subscriptions/SubscriptionService';
export const managedModelSchema = modelSummarySchema.extend({
  revision:z.string().min(1),hasDeployment:z.boolean(),availableForSubscriptions:z.boolean(),
  locations:z.array(z.string()).default([]),
  modelUri:z.string().optional(),modelName:z.string().optional(),runtimeImage:z.string().optional(),replicas:z.number().int().optional(),
});
export function parseManagedModels(value: unknown) {
  const result=z.array(managedModelSchema).safeParse(value);
  if(result.success)return result.data;
  // A running backend from before API consolidation still returns catalog summaries.
  const legacy=z.array(modelSummarySchema).safeParse(value);
  if(legacy.success && legacy.data.some(model=>
    !Object.hasOwn(model,'hasDeployment') || !Object.hasOwn(model,'availableForSubscriptions'))) {
    throw new ServiceError('invalid_response','The models API is missing model management fields. Restart npm run dev:git, then reload this page.');
  }
  const fields=Array.from(new Set(result.error.issues.map(issue=>issue.path.join('.')))).slice(0,3);
  throw new ServiceError('invalid_response',`The models API returned invalid data${fields.length ? ` for ${fields.join(', ')}` : ''}. Check the response from /api/models.`);
}
