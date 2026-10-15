import { z } from 'zod';
export const clusterNameSchema=z.string().min(1).max(253).regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/);
export const enrollClusterSchema=z.object({aiGridEnabled:z.literal(true)}).strict();
export const clusterSchema=z.object({name:clusterNameSchema,status:z.enum(['Ready','Offline','Unknown']),aiGridEnabled:z.boolean(),
  provisioned:z.boolean(),provisioningStatus:z.enum(['Provisioned','Provisioning','Not provisioned']),location:z.string().optional(),site:z.string().optional(),region:z.string().optional(),siteName:z.string().optional(),latitude:z.number().min(-90).max(90).optional(),longitude:z.number().min(-180).max(180).optional()}).strict();
export const managedClusterSchema=z.object({apiVersion:z.literal('cluster.open-cluster-management.io/v1'),kind:z.literal('ManagedCluster'),
  metadata:z.object({name:clusterNameSchema,namespace:z.never().optional(),labels:z.record(z.string()).optional()}).passthrough(),
  status:z.object({conditions:z.array(z.object({type:z.string(),status:z.string()}).passthrough()).optional()}).passthrough().optional(),
}).passthrough();
