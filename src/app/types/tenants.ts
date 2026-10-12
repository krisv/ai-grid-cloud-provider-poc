import { z } from 'zod';
import { tenantInputSchema } from '../../../shared/tenant-validation.mjs';
export type TenantInput = z.infer<typeof tenantInputSchema>;
export type IdentityProviderConfig = TenantInput['identityProvider']['config'];
export type Tenant = TenantInput & {status:'Saved';revision:string;creationTimestamp:string;updatedAt:string};
export const tenantSchema = tenantInputSchema.extend({status:z.literal('Saved'),revision:z.string().min(1),
  creationTimestamp:z.string(),updatedAt:z.string()});
