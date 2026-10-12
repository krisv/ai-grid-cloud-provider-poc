import { z } from 'zod';
export { clusterSchema } from '../../../shared/cluster-validation.mjs';
import { clusterSchema } from '../../../shared/cluster-validation.mjs';
export type GridCluster=z.infer<typeof clusterSchema>;
