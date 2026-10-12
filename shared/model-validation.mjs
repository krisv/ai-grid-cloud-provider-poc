import { z } from 'zod';
import { resourceName } from './subscription-validation.mjs';
export const modelNameSchema = resourceName.max(63);
export const locationSchema = z.string().min(1).max(63).regex(/^[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?$/, 'Use a Kubernetes label value for the location.');
export const locationsSchema = z.array(locationSchema).max(64).refine(values => new Set(values).size === values.length, 'Locations must be unique.');
export const defaultLocations = ['site1', 'site2', 'site3'];
export const createModelSchema = z.object({
  name: modelNameSchema,
  displayName: z.string().trim().min(1).max(253),
  description: z.string().max(4000).optional(),
  modelUri: z.string().trim().max(2048).regex(/^(hf|oci|s3|pvc|https?):\/\/[^\s]+$/, 'Enter a model URI using hf, oci, s3, pvc, http or https.'),
  modelName: z.string().trim().min(1).max(253),
  runtimeImage: z.string().trim().min(1).max(2048).regex(/^\S+$/, 'Enter a container image without spaces.'),
  replicas: z.number().int().min(1).max(99),
  cpu: z.string().regex(/^(?:[1-9]\d*|0\.[0-9]*[1-9]\d*|[1-9]\d*\.\d+|[1-9]\d*m)$/, 'Enter positive CPU cores or millicores, for example 2 or 500m.'),
  memory: z.string().regex(/^[1-9]\d*(?:Mi|Gi|Ti)$/, 'Enter memory such as 4Gi or 512Mi.'),
  gpuCount: z.number().int().min(0).max(64),
  runtimeArgs: z.array(z.string().max(4096)).max(64),
  locations: locationsSchema.refine(values => values.length > 0, 'Select at least one location.'),
}).strict();
