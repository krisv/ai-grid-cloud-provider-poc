import { z } from 'zod';
import { ServiceError } from '~/services/subscriptions/SubscriptionService';
import type { MaaSSubscription } from '~/app/types/subscriptions';
export { createSchema, updateSchema } from '../../../shared/subscription-validation.mjs';
const group = z.object({name: z.string().trim().min(1)}).passthrough();
const rateLimit = z.object({limit: z.number(), window: z.string()}).passthrough();
export const modelRefSchema = z.object({name:z.string(),  displayName:z.string().optional(),
  description:z.string().optional(), unlimited:z.boolean().optional(), tokenRateLimits: z.array(rateLimit).nullish().transform(v => v ?? []),
  billingRate: z.object({perToken:z.string()}).passthrough().optional()}).passthrough();
const metadata = z.object({organizationId:z.string().optional(), costCenter:z.string().optional(), labels:z.record(z.string()).optional()}).passthrough();
const statusFields = {phase:z.string().optional(), statusMessage:z.string().optional(), status:z.string().optional(),
  conditionType:z.string().optional(), lastTransitionTime:z.string().optional(), reason:z.string().optional(),
  creationTimestamp:z.string().optional(), deletionTimestamp:z.string().optional()};
export const subscriptionSchema = z.object({name:z.string(),  revision:z.string().min(1), displayName:z.string().optional(),
  description:z.string().optional(), priority:z.number().optional(), owner:z.object({groups:z.array(group)}).passthrough(),
  modelRefs:z.array(modelRefSchema), tokenMetadata:metadata.optional(), ...statusFields}).passthrough();
export const modelSummarySchema = z.object({name:z.string(),  displayName:z.string().optional(), description:z.string().optional(),
  modelRef:z.object({kind:z.string(), name:z.string()}).passthrough(), endpoint:z.string().optional(), ...statusFields}).passthrough();
export const policySchema = z.object({name:z.string(),  displayName:z.string().optional(), description:z.string().optional(),
  modelRefs:z.array(z.object({name:z.string()}).passthrough()), subjects:z.object({groups:z.array(group).optional()}).passthrough(),
  meteringMetadata:metadata.optional(), ...statusFields}).passthrough();
export const infoSchema = z.object({subscription:subscriptionSchema, modelRefs:z.array(modelSummarySchema), authPolicies:z.array(policySchema),
  meteringMetadata:metadata.optional()}).passthrough();
export const mutationSchema = z.object({subscription:subscriptionSchema, authPolicy:policySchema.optional()}).passthrough();
export function parseResponse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ServiceError('invalid_response', 'The subscription API returned an invalid response.');
  return result.data;
}
export const normalizeSubscription = (value: unknown): MaaSSubscription => parseResponse(subscriptionSchema, value);
export function validateInput(schema: z.ZodTypeAny, value: unknown): void {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fields = Object.fromEntries(result.error.issues.map(issue => [issue.path.join('.'), issue.message]));
    throw new ServiceError('validation', Object.values(fields).join(' '), fields);
  }
}
