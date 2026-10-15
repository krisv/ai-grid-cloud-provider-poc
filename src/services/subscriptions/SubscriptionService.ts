import type { CreateModelRequest, ManagedModel } from '~/app/types/models';
import type { Tenant, TenantInput } from '~/app/types/tenants';
import type { GridCluster } from '~/app/types/clusters';
import type { CreateSubscriptionRequest, CreateSubscriptionResponse, MaaSModelRefSummary,
  MaaSSubscription, SubscriptionInfoResponse, UpdateSubscriptionRequest } from '~/app/types/subscriptions';
import { z } from 'zod';
import { gridOverviewSchema } from '../../../shared/grid-monitoring.mjs';
export type GridOverview=z.infer<typeof gridOverviewSchema>;
export interface SubscriptionService {
  getGridOverview(range: string,site?:string,includeMetrics?:boolean): Promise<GridOverview>;
  listClusters(): Promise<GridCluster[]>;
  enrollCluster(name:string): Promise<GridCluster>;
  listTenants(): Promise<Tenant[]>;
  getTenant(name:string): Promise<Tenant>;
  createTenant(input:TenantInput): Promise<Tenant>;
  updateTenant(name:string,input:TenantInput,revision:string): Promise<Tenant>;
  deleteTenant(name:string,revision:string): Promise<void>;
  list(): Promise<MaaSSubscription[]>;
  getInfo(name: string): Promise<SubscriptionInfoResponse>;
  create(input: CreateSubscriptionRequest): Promise<CreateSubscriptionResponse>;
  update(name: string, input: UpdateSubscriptionRequest, expectedRevision: string): Promise<CreateSubscriptionResponse>;
  delete(name: string, expectedRevision: string): Promise<void>;
  listModels(): Promise<ManagedModel[]>;
  listLocations(): Promise<string[]>;
  createModel(input: CreateModelRequest): Promise<ManagedModel>;
  deleteModel(name:string,revision:string): Promise<void>;
}
export type ServiceErrorCode = 'unavailable' | 'validation' | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'invalid_response';
export class ServiceError extends Error {
  constructor(public code: ServiceErrorCode, message: string, public fieldErrors?: Record<string, string>) { super(message); this.name = 'ServiceError'; }
}
