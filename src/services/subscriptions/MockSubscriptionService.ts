import { demoMetrics } from '../../../shared/grid-monitoring.mjs';
import type { CreateModelRequest, ManagedModel } from '~/app/types/models';
import type { MaaSModelRefSummary } from '~/app/types/subscriptions';
import { createModelSchema, defaultLocations } from '../../../shared/model-validation.mjs';
import type { CreateSubscriptionRequest, CreateSubscriptionResponse, MaaSAuthPolicy, MaaSSubscription, SubscriptionInfoResponse, UpdateSubscriptionRequest } from '~/app/types/subscriptions';
import { createSchema, updateSchema, validateInput } from '~/app/adapters/subscriptions';
import { ServiceError, type SubscriptionService, type GridOverview } from './SubscriptionService';
import * as fixtures from './fixtures';
import { withoutNamespace } from '../../../shared/public-data.mjs';
import { tenantInputSchema } from '../../../shared/tenant-validation.mjs';
import type { Tenant, TenantInput } from '~/app/types/tenants';
import type { GridCluster } from '~/app/types/clusters';
type State = { tenants?:Tenant[]; managedPolicyNames?:string[]; subscriptions: MaaSSubscription[]; policies: MaaSAuthPolicy[]; models?:MaaSModelRefSummary[]; deployments?:Array<CreateModelRequest & {revision:string;creationTimestamp:string}> };
export class MockSubscriptionService implements SubscriptionService {
  async getGridOverview(range:string,site?:string,includeMetrics=true):Promise<GridOverview> {
    await this.before('getGridOverview');
    const sites=[['brussels','Brussels',50.8503,4.3517],['new-york','New York',40.7128,-74.0060],['san-francisco','San Francisco',37.7749,-122.4194]] as const;
    const clusters=sites.map(([id,siteName,latitude,longitude],index)=>({name:`demo-${id}`,site:id,siteName,latitude,longitude,location:id,
      aiGridEnabled:true,provisioned:true,provisioningStatus:'Provisioned' as const,status:index===1 ? 'Offline' as const : 'Ready' as const})).filter(c=>!site || c.site===site);
    const end=Math.floor(Date.now()/1000),duration=range==='24h' ? 86400 : range==='6h' ? 21600 : 3600;
    return {updatedAt:new Date().toISOString(),inventorySource:'demo' as const,demo:true,metricsSource:'demo' as const,clusters,
      metrics:!includeMetrics ? [] : demoMetrics(clusters,end-duration,end,Math.ceil(duration/60)) as GridOverview['metrics']};
  }

  private state: State;
  private failure?: {operation: keyof SubscriptionService; error: ServiceError};
  constructor(private options: {storage?: Storage; storageKey?: string; delay?: number; seed?: State} = {}) {
    this.state = structuredClone(options.seed ?? {subscriptions:fixtures.subscriptions, policies:fixtures.policies});
    this.readStorage();
  }
  private get key() { return this.options.storageKey ?? 'maas-admin-subscriptions-v1'; }
  private readStorage() {
    const saved = this.options.storage?.getItem(this.key);
    if (saved) { try { const parsed: State = JSON.parse(saved); if (Array.isArray(parsed.subscriptions) && Array.isArray(parsed.policies)) this.state = withoutNamespace(parsed) as State; } catch { /* keep seed when local data is malformed */ } }
  }
  private save(next: State) {
    try { this.options.storage?.setItem(this.key, JSON.stringify(next)); }
    catch { throw new ServiceError('unavailable', 'Mock data could not be saved. Check browser storage availability.'); }
    this.state = next;
  }
  failNext(operation: keyof SubscriptionService, error: ServiceError) { this.failure = {operation, error}; }
  private async before(operation: keyof SubscriptionService) {
    if (this.options.delay) await new Promise(resolve => setTimeout(resolve, this.options.delay));
    if (this.failure?.operation === operation) { const error = this.failure.error; this.failure = undefined; throw error; }
    this.readStorage();
  }
  private find(name: string) {
    const sub = this.state.subscriptions.find(s => s.name === name);
    if (!sub) throw new ServiceError('not_found', 'This subscription could not be found.');
    return sub;
  }
  private check(sub: MaaSSubscription, revision: string) {
    if (!revision || sub.revision !== revision) throw new ServiceError('conflict', 'This subscription changed. Reload it before saving or deleting.');
    if (sub.deletionTimestamp) throw new ServiceError('conflict', 'This subscription is being deleted.');
  }
  async list() { await this.before('list'); return structuredClone(this.state.subscriptions); }
  async listClusters():Promise<GridCluster[]> {
    throw new ServiceError('unavailable','Cluster management requires the backend. Start npm run dev:git to use Git files or a configured ACM Hub.');
  }
  async enrollCluster(_name:string):Promise<GridCluster> {
    throw new ServiceError('unavailable','Cluster enrollment requires the ACM Hub backend.');
  }
  async listTenants() { await this.before('listTenants');return structuredClone(this.state.tenants ?? []); }
  private findTenant(name:string) {
    const tenant=this.state.tenants?.find(tenant=>tenant.name===name);
    if(!tenant)throw new ServiceError('not_found','This tenant could not be found.');return tenant;
  }
  async getTenant(name:string) { await this.before('getTenant');return structuredClone(this.findTenant(name)); }
  private checkTenant(tenant:Tenant,revision:string) {
    if(!revision || tenant.revision!==revision)throw new ServiceError('conflict','This tenant changed. Reload it before saving or deleting.');
  }
  private checkDomains(input:TenantInput) {
    if(this.state.tenants?.some(tenant=>tenant.name!==input.name && tenant.domains.some(domain=>input.domains.includes(domain))))
      throw new ServiceError('conflict','One or more domains are already assigned to another tenant.');
  }
  async createTenant(input:TenantInput) {
    await this.before('createTenant');validateInput(tenantInputSchema,input);const parsed=tenantInputSchema.parse(input);
    if(this.state.tenants?.some(tenant=>tenant.name===parsed.name))throw new ServiceError('conflict','A tenant with this name already exists.');
    this.checkDomains(parsed);const now=new Date().toISOString();
    const tenant:Tenant={...parsed,status:'Saved',creationTimestamp:now,updatedAt:now,revision:crypto.randomUUID()};
    this.save({...this.state,tenants:[...(this.state.tenants ?? []),tenant]});return structuredClone(tenant);
  }
  async updateTenant(name:string,input:TenantInput,revision:string) {
    await this.before('updateTenant');const old=this.findTenant(name);this.checkTenant(old,revision);
    validateInput(tenantInputSchema,input);const parsed=tenantInputSchema.parse(input);
    if(parsed.name!==name)throw new ServiceError('validation','The tenant name cannot be changed.');
    this.checkDomains(parsed);const tenant:Tenant={...old,...parsed,updatedAt:new Date().toISOString(),revision:crypto.randomUUID()};
    this.save({...this.state,tenants:this.state.tenants?.map(value=>value.name===name ? tenant : value)});return structuredClone(tenant);
  }
  async deleteTenant(name:string,revision:string) {
    await this.before('deleteTenant');this.checkTenant(this.findTenant(name),revision);
    this.save({...this.state,tenants:this.state.tenants?.filter(tenant=>tenant.name!==name)});
  }
  private currentModels():ManagedModel[] {
    const models=this.state.models ?? fixtures.models;
    return models.map(model=>{
      const deployment=(this.state.deployments ?? []).find(d=>model.modelRef.kind==='LLMInferenceService' && d.name===model.modelRef.name);
      return {...(deployment ?? {}),...model,revision:`${model.revision ?? '1'}:${deployment?.revision ?? '0'}`,
        locations:deployment?.locations ?? [],
        hasDeployment:Boolean(deployment),availableForSubscriptions:true};
    });
  }
  async listModels() { await this.before('listModels');return structuredClone(this.currentModels()); }
  async listLocations() { await this.before('listLocations');return [...defaultLocations]; }
  async createModel(input:CreateModelRequest):Promise<ManagedModel> {
    await this.before('createModel');validateInput(createModelSchema,input);
    if(input.locations.some(location=>!defaultLocations.includes(location)))throw new ServiceError('validation','Select locations from the available location catalog.');
    const deployments=this.state.deployments ?? [];const models=this.state.models ?? fixtures.models;
    if(deployments.some(d=>d.name===input.name) || models.some(m=>m.name===input.name)) {
      throw new ServiceError('conflict','A model with this resource name already exists.');
    }
    const deployment={...input,revision:'1',creationTimestamp:new Date().toISOString()};
    const model:MaaSModelRefSummary={name:input.name,displayName:input.displayName,
      description:input.description,modelRef:{kind:'LLMInferenceService',name:input.name},phase:'Pending',creationTimestamp:deployment.creationTimestamp};
    this.save({...this.state,deployments:[...deployments,deployment],models:[...models,model]});
    return structuredClone(this.currentModels().find(m=>m.name===input.name)!);
  }
  async deleteModel(name:string,revision:string) {
    await this.before('deleteModel');
    const current=this.currentModels().find(m=>m.name===name);
    if(!current)throw new ServiceError('not_found','This model could not be found.');
    if(!revision || revision!==current.revision)throw new ServiceError('conflict','This model changed. Reload it before deleting.');
    const deployments=this.state.deployments ?? [];const models=this.state.models ?? fixtures.models;
    const deployment=current.modelRef.kind==='LLMInferenceService' ? deployments.find(d=>d.name===current.modelRef.name) : undefined;
    const registrations=deployment ? models.filter(m=>m.modelRef.kind==='LLMInferenceService' && m.modelRef.name===deployment.name) : models.filter(m=>m.name===name);
    if([...this.state.subscriptions,...this.state.policies].some(s=>s.modelRefs.some(ref=>registrations.some(m=>m.name===ref.name)))) {
      throw new ServiceError('conflict','Remove this model from its subscriptions and authorization policies before deleting it.');
    }
    this.save({...this.state,deployments:deployments.filter(d=>d!==deployment),models:models.filter(m=>!registrations.includes(m))});
  }
  async getInfo(name: string): Promise<SubscriptionInfoResponse> {
    await this.before('getInfo'); const sub = this.find(name);
    return structuredClone({subscription:sub, modelRefs:(this.state.models ?? fixtures.models).filter(m => sub.modelRefs.some(r => r.name===m.name)),
      authPolicies:this.state.policies.filter(p => p.modelRefs.some(m => sub.modelRefs.some(r => r.name===m.name))),
      meteringMetadata:sub.tokenMetadata});
  }
  async create(input: CreateSubscriptionRequest): Promise<CreateSubscriptionResponse> {
    await this.before('create'); validateInput(createSchema, input);
    if (this.state.subscriptions.some(s => s.name===input.name)) throw new ServiceError('conflict', 'A subscription with this resource name already exists.');
    const {createAuthPolicy: _createPolicy, ...configuration} = structuredClone(input);
    const subscription: MaaSSubscription = {...configuration,  revision:'1', phase:'Saved', creationTimestamp:new Date().toISOString()};
    const authPolicy: MaaSAuthPolicy | undefined = input.createAuthPolicy ? {name:`${input.name}-policy`,  displayName:input.displayName, description:input.description,
      subjects:structuredClone(input.owner), modelRefs:input.modelRefs.map(({name})=>({name})), phase:'Ready', creationTimestamp:subscription.creationTimestamp} : undefined;
    if (authPolicy && this.state.policies.some(p => p.name===authPolicy.name) && !this.state.managedPolicyNames?.includes(authPolicy.name)) throw new ServiceError('conflict', 'An independently managed authorization policy already uses this name. Choose another subscription name.');
    this.save({...this.state,subscriptions:[...this.state.subscriptions,subscription], policies:authPolicy ? [...this.state.policies.filter(p=>p.name!==authPolicy.name),authPolicy] : this.state.policies,
      managedPolicyNames:authPolicy ? [...new Set([...(this.state.managedPolicyNames ?? []),authPolicy.name])] : this.state.managedPolicyNames});
    return structuredClone({subscription, authPolicy});
  }
  async update(name: string, input: UpdateSubscriptionRequest, revision: string): Promise<CreateSubscriptionResponse> {
    await this.before('update'); const existing = this.find(name); this.check(existing,revision); validateInput(updateSchema,input);
    const subscription: MaaSSubscription = {...existing, ...structuredClone(input), tokenMetadata:input.tokenMetadata ?? existing.tokenMetadata,
      modelRefs:input.modelRefs.map(ref => ({...existing.modelRefs.find(old=>old.name===ref.name), ...structuredClone(ref)})),
      name:existing.name, revision:String(Number(existing.revision)+1)};
    this.save({...this.state, subscriptions:this.state.subscriptions.map(s=>s.name===name ? subscription : s)});
    return structuredClone({subscription});
  }
  async delete(name: string, revision: string): Promise<void> {
    await this.before('delete'); this.check(this.find(name),revision);
    const policyName=`${name}-policy`;
    this.save({...this.state, subscriptions:this.state.subscriptions.filter(s=>s.name!==name),
      policies:this.state.policies.filter(p=>p.name!==policyName || !this.state.managedPolicyNames?.includes(policyName)),
      managedPolicyNames:this.state.managedPolicyNames?.filter(policy=>policy!==policyName)});
  }
}
