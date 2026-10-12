import { z } from 'zod';
import { createModelSchema } from '../../../shared/model-validation.mjs';
import type { MaaSModelRefSummary } from './subscriptions';
export type CreateModelRequest = z.infer<typeof createModelSchema>;
export type ManagedModel = MaaSModelRefSummary & {
  locations: string[];
  revision: string;
  hasDeployment: boolean;
  availableForSubscriptions: boolean;
  modelUri?: string;
  modelName?: string;
  runtimeImage?: string;
  replicas?: number;
};
