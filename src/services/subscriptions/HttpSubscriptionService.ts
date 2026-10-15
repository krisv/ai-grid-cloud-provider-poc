import { gridOverviewSchema } from '../../../shared/grid-monitoring.mjs';
import type { CreateModelRequest } from '~/app/types/models';
import { managedModelSchema, parseManagedModels } from '~/app/adapters/models';
import { locationsSchema } from '../../../shared/model-validation.mjs';
import { z } from 'zod';
import { tenantSchema, type TenantInput } from '~/app/types/tenants';
import { clusterSchema } from '~/app/types/clusters';
import type { CreateSubscriptionRequest, UpdateSubscriptionRequest } from '~/app/types/subscriptions';
import { infoSchema, modelSummarySchema, mutationSchema, parseResponse, subscriptionSchema } from '~/app/adapters/subscriptions';
import { ServiceError, type ServiceErrorCode, type SubscriptionService } from './SubscriptionService';
// Proposed transport contract is documented in docs/subscription-api-contract.md.
// Authentication can be supplied via transport; feature components never handle credentials.
export class HttpSubscriptionService implements SubscriptionService {
  // Browser fetch must retain its global receiver when called through the service.
  constructor(private baseUrl = '/api', private transport: typeof fetch = (...args) => globalThis.fetch(...args)) {}
  private async request(path: string, method = 'GET', body?: unknown, revision?: string): Promise<unknown> {
    const resource=path.startsWith('/clusters') ? 'cluster' : path.startsWith('/tenants') ? 'tenant' : 'subscription';
    let response: Response;
    try {
      response = await this.transport(`${this.baseUrl.replace(/\/$/,'')}${path}`, { method, credentials:'same-origin',
        headers:{Accept:'application/json', ...(body ? {'Content-Type':'application/json'} : {}), ...(revision ? {'If-Match':JSON.stringify(revision)} : {})},
        body:body ? JSON.stringify(body) : undefined });
    } catch { throw new ServiceError('unavailable',`The ${resource} service is unavailable. Try again.`); }
    if (!response.ok) {
      const mapping: Record<number,[ServiceErrorCode,string]> = {
        413:['validation','The request body is too large.'],415:['validation','The request body must use application/json.'],
        400:['validation','The subscription configuration is invalid.'],422:['validation','The subscription configuration is invalid.'],
        401:['unauthorized','Sign in to manage subscriptions.'],403:['forbidden','You do not have permission to manage subscriptions.'],
        404:['not_found','This subscription could not be found.'],409:['conflict','This subscription changed or its name is already in use. Reload before retrying.'],
        412:['conflict','This subscription changed. Reload before saving or deleting.'],428:['conflict','Reload this subscription before saving or deleting.'],
      };
      const [code,message] = mapping[response.status] ?? ['unavailable',`The ${resource} service is unavailable. Try again.`];
      // This contract exposes user-safe domain errors, never raw cluster errors.
      let fieldErrors: Record<string,string> | undefined;
      let safeMessage=message;
      try {
        const parsed=z.object({code:z.string(),message:z.string().min(1).max(1000),fieldErrors:z.record(z.string().max(500)).optional()}).safeParse(await response.json());
        if(parsed.success && parsed.data.code===code) {safeMessage=parsed.data.message;fieldErrors=parsed.data.fieldErrors;}
      } catch { /* Keep the local fallback for non-contract error bodies. */ }
      throw new ServiceError(code,safeMessage,fieldErrors);
    }
    if (response.status===204) return undefined;
    try { return await response.json(); } catch { throw new ServiceError('invalid_response','The subscription API returned an invalid response.'); }
  }
  async getGridOverview(range:string,site?:string,includeMetrics=true) {
    const query=new URLSearchParams({range,...(site ? {site} : {}),...(!includeMetrics ? {metrics:'false'} : {})});
    return parseResponse(gridOverviewSchema,await this.request(`/grid/overview?${query}`));
  }
  async list() { return parseResponse(z.array(subscriptionSchema),await this.request('/subscriptions')); }
  async getInfo(name: string) { return parseResponse(infoSchema,await this.request(`/subscriptions/${encodeURIComponent(name)}`)); }
  async create(input: CreateSubscriptionRequest) { return parseResponse(mutationSchema,await this.request('/subscriptions','POST',input)); }
  async update(name: string,input: UpdateSubscriptionRequest,revision: string) {
    if (!revision) throw new ServiceError('conflict','Reload this subscription before saving.');
    return parseResponse(mutationSchema,await this.request(`/subscriptions/${encodeURIComponent(name)}`,'PUT',input,revision));
  }
  async delete(name: string,revision: string) {
    if (!revision) throw new ServiceError('conflict','Reload this subscription before deleting.');
    await this.request(`/subscriptions/${encodeURIComponent(name)}`,'DELETE',undefined,revision);
  }
  async createModel(input: CreateModelRequest) { return parseResponse(managedModelSchema,await this.request('/models','POST',input)); }
  async deleteModel(name:string,revision:string) {
    if (!revision) throw new ServiceError('conflict','Reload this model before deleting.');
    await this.request(`/models/${encodeURIComponent(name)}`,'DELETE',undefined,revision);
  }
  async listModels() { return parseManagedModels(await this.request('/models')); }
  async listLocations() { return parseResponse(locationsSchema,await this.request('/locations')); }
  async listClusters() { return parseResponse(z.array(clusterSchema),await this.request('/clusters')); }
  async enrollCluster(name:string) { return parseResponse(clusterSchema,await this.request(`/clusters/${encodeURIComponent(name)}`,'PATCH',{aiGridEnabled:true})); }
  async listTenants() { return parseResponse(z.array(tenantSchema),await this.request('/tenants')); }
  async getTenant(name:string) { return parseResponse(tenantSchema,await this.request(`/tenants/${encodeURIComponent(name)}`)); }
  async createTenant(input:TenantInput) { return parseResponse(tenantSchema,await this.request('/tenants','POST',input)); }
  async updateTenant(name:string,input:TenantInput,revision:string) {
    if(!revision)throw new ServiceError('conflict','Reload this tenant before saving.');
    return parseResponse(tenantSchema,await this.request(`/tenants/${encodeURIComponent(name)}`,'PUT',input,revision));
  }
  async deleteTenant(name:string,revision:string) {
    if(!revision)throw new ServiceError('conflict','Reload this tenant before deleting.');
    await this.request(`/tenants/${encodeURIComponent(name)}`,'DELETE',undefined,revision);
  }
}
