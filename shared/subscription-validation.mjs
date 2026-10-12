import { z } from 'zod';
export const resourceName = z.string().min(1).max(253).regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/);
export const dnsName = z.string().min(1).max(253).regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/);
export const projectName = z.string().min(1).max(63).regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/);
const group = z.object({name:z.string().trim().min(1)}).passthrough();
const guardrails = z.array(z.object({ref:z.object({name:dnsName}).strict(),checks:z.array(z.string().min(1).max(63)).max(64).optional()}).passthrough()).max(64);
const rate = z.object({limit:z.number().int().min(1).max(1_000_000_000),window:z.string().regex(/^[1-9]\d{0,3}[smh]$/)}).passthrough();
const metadata = z.object({organizationId:z.string().optional(),costCenter:z.string().optional(),labels:z.record(z.string()).optional()}).passthrough();
export const inputModelSchema = z.object({name:dnsName.max(63),namespace:z.never().optional(),displayName:z.string().optional(),description:z.string().optional(),
  unlimited:z.boolean().optional(),tokenRateLimits:z.array(rate),billingRate:z.object({perToken:z.string()}).passthrough().optional(),guardrails:guardrails.optional()}).passthrough()
  .refine(ref=>ref.unlimited ? ref.tokenRateLimits.length===0 : ref.tokenRateLimits.length>0,'At least one token limit is required unless the model is unlimited');
export const updateSchema = z.object({namespace:z.never().optional(),displayName:z.string().trim().min(1).optional(),description:z.string().optional(),priority:z.number().int().min(-1_000_000).max(1_000_000),
  owner:z.object({groups:z.array(group).min(1),users:z.array(z.string().min(1)).optional()}).passthrough(),
  modelRefs:z.array(inputModelSchema).min(1).refine(refs=>new Set(refs.map(ref=>ref.name)).size===refs.length,'Models must be unique'),
  tokenMetadata:metadata.optional(),inferencePriority:z.number().int().min(-2147483648).max(2147483647).optional(),guardrails:guardrails.optional()}).passthrough();
export const createSchema = updateSchema.extend({name:resourceName,createAuthPolicy:z.boolean()});
