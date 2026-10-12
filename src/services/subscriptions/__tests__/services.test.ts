import { describe, it, expect, vi } from 'vitest';
import { MockSubscriptionService } from '../MockSubscriptionService';
import { HttpSubscriptionService } from '../HttpSubscriptionService';
import { ServiceError } from '../SubscriptionService';
import { normalizeSubscription } from '~/app/adapters/subscriptions';
import { subscriptions } from '../fixtures';
import { toRateLimit, toTokenRateLimit, rateLimitsSchema } from '~/app/utilities/rateLimits';
import { setupDefaults, handleUpdateLogic, isK8sNameDescriptionDataValid } from '~/shared/utilities/nameField';
import type { CreateSubscriptionRequest } from '~/app/types/subscriptions';
const input: CreateSubscriptionRequest = {name:'new-team',displayName:'New team',priority:7,owner:{groups:[{name:'custom-group'}]},modelRefs:[{name:'granite-3-8b',tokenRateLimits:[{limit:1234,window:'2h'}]}],createAuthPolicy:true};
describe('subscription domain and mock service',()=>{
  it('creates and edits subscriptions, removes their generated policies and allows re-creation',async()=>{
    const service=new MockSubscriptionService();
    const created=await service.create(input);
    expect(created.authPolicy?.subjects.groups).toEqual(input.owner.groups);
    expect((await service.getInfo(input.name)).modelRefs[0].name).toBe('granite-3-8b');
    const updated=await service.update(input.name,{...input,description:'Updated',priority:9},created.subscription.revision!);
    expect(updated.subscription.priority).toBe(9);
    expect(((await service.getInfo('engineering')).authPolicies).find(p=>p.name==='new-team-policy')?.subjects.groups).toEqual(input.owner.groups);
    await expect(service.update(input.name,input,created.subscription.revision!)).rejects.toMatchObject({code:'conflict'});
    await expect(service.delete(input.name,created.subscription.revision!)).rejects.toMatchObject({code:'conflict'});
    await service.delete(input.name,updated.subscription.revision!);
    await expect(service.getInfo(input.name)).rejects.toMatchObject({code:'not_found'});
    expect(((await service.getInfo('engineering')).authPolicies).some(p=>p.name==='new-team-policy')).toBe(false);
    expect((await service.create(input)).authPolicy?.name).toBe('new-team-policy');
  });
  it('retains billing and metering on an unrelated update',async()=>{
    const service=new MockSubscriptionService(); const {subscription}=await service.getInfo('engineering');
    const result=await service.update(subscription.name,{displayName:'Renamed',owner:subscription.owner,priority:123,
      modelRefs:subscription.modelRefs.map(({billingRate,...rest})=>rest)},subscription.revision!);
    expect(result.subscription.modelRefs[0].billingRate).toEqual(subscription.modelRefs[0].billingRate);
    expect(result.subscription.tokenMetadata).toEqual(subscription.tokenMetadata);
  });
  it('preserves controller fields and existing unlimited access',async()=>{
    const original=structuredClone(subscriptions[0]);
    original.owner.users=['alice'];original.inferencePriority=-4;
    original.guardrails=[{ref:{name:'safety'},checks:['pii']}];
    original.modelRefs[0]={...original.modelRefs[0],unlimited:true,tokenRateLimits:[],guardrails:[{ref:{name:'content'}}]};
    const service=new MockSubscriptionService({seed:{subscriptions:[original],policies:[]}});
    const result=await service.update(original.name,{owner:original.owner,modelRefs:original.modelRefs,priority:1},original.revision!);
    expect(result.subscription.owner.users).toEqual(['alice']);
    expect(result.subscription.inferencePriority).toBe(-4);
    expect(result.subscription.guardrails).toEqual(original.guardrails);
    expect(result.subscription.modelRefs[0]).toMatchObject({unlimited:true,tokenRateLimits:[],guardrails:original.modelRefs[0].guardrails});
  });
  it('supports optional policy creation and rejects duplicate names and invalid input',async()=>{
    const service=new MockSubscriptionService();
    expect((await service.create({...input,createAuthPolicy:false})).authPolicy).toBeUndefined();
    await expect(service.create(input)).rejects.toMatchObject({code:'conflict'});
    for(const change of [{priority:1000001},{owner:{groups:[]}},{modelRefs:[]},{name:'INVALID'},{modelRefs:[{...input.modelRefs[0],tokenRateLimits:[]}]}]) {
      await expect(service.create({...input,...change})).rejects.toMatchObject({code:'validation'});
    }
  });
  it('persists mocks and detects conflicts across service instances',async()=>{
    const storage=new Map<string,string>();const fakeStorage={getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>{storage.set(k,v);},removeItem:(k:string)=>{storage.delete(k);},clear:()=>storage.clear(),key:(i:number)=>Array.from(storage.keys())[i]??null,get length(){return storage.size;}} satisfies Storage;
    const first=new MockSubscriptionService({storage:fakeStorage});const second=new MockSubscriptionService({storage:fakeStorage});
    const old=(await second.getInfo('engineering')).subscription;
    await first.update(old.name,{owner:old.owner,modelRefs:old.modelRefs,priority:8},old.revision!);
    await expect(second.delete(old.name,old.revision!)).rejects.toMatchObject({code:'conflict'});
    expect((await new MockSubscriptionService({storage:fakeStorage}).getInfo(old.name)).subscription.priority).toBe(8);
  });
  it('fails atomically and returns copies rather than mutable internal records',async()=>{
    const service=new MockSubscriptionService();const list=await service.list();list[0].owner.groups=[];
    expect((await service.list())[0].owner.groups.length).toBe(1);
    service.failNext('delete',new ServiceError('forbidden','Permission denied.'));
    await expect(service.delete('engineering','1')).rejects.toMatchObject({code:'forbidden'});
    expect((await service.list()).length).toBe(3);
  });
  it('normalizes null limits and preserves additional configuration',()=>{
    const result=normalizeSubscription({...subscriptions[0],extension:{enabled:true},modelRefs:[{...subscriptions[0].modelRefs[0],tokenRateLimits:null}]});
    expect(result.modelRefs[0].tokenRateLimits).toEqual([]);
    expect(result.modelRefs[0].billingRate?.perToken).toBe('0.000002');
    expect(result).toHaveProperty('extension.enabled',true);
    expect(()=>normalizeSubscription({name:'bad'})).toThrow(ServiceError);
  });
  it('round-trips durations and enforces rate-limit ranges',()=>{
    for(const window of ['1s','30m','24h']) expect(toTokenRateLimit(toRateLimit({limit:2000,window}))).toEqual({limit:2000,window});
    expect(rateLimitsSchema.safeParse([{count:0,time:1,unit:'hour'}]).success).toBe(false);
    expect(rateLimitsSchema.safeParse([{count:1000000001,time:1,unit:'hour'}]).success).toBe(false);
  });
  it('generates names, validates explicit names, preserves manual names and prevents renaming',()=>{
    let data=handleUpdateLogic(setupDefaults({}))('name','My Team');
    expect(data.k8sName.value).toBe('my-team');expect(isK8sNameDescriptionDataValid(data)).toBe(true);
    data=handleUpdateLogic(data)('k8sName','UPPER');expect(isK8sNameDescriptionDataValid(data)).toBe(false);
    data=handleUpdateLogic(data)('k8sName','custom');data=handleUpdateLogic(data)('name','Another team');expect(data.k8sName.value).toBe('custom');
    const edit=setupDefaults({initialData:{name:'Old',k8sName:'old'}});
    expect(handleUpdateLogic(edit)('name','New').k8sName.value).toBe('old');
  });
});
describe('HTTP boundary',()=>{
  it('reports model response validation errors without accepting malformed successful responses',async()=>{
    const transport=vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      name:'model',modelRef:{kind:'LLMInferenceService',name:'model'},revision:'opaque',
      hasDeployment:true,availableForSubscriptions:true,replicas:'one',
    }]),{status:200}));
    await expect(new HttpSubscriptionService('/api',transport).listModels()).rejects.toMatchObject({
      code:'invalid_response',message:expect.stringContaining('0.replicas'),
    });
  });

  it('calls browser fetch with its global receiver and accepts an empty collection',async()=>{
    const browserFetch=vi.fn(function(this: unknown) {
      if(this!==globalThis) throw new TypeError('Illegal invocation');
      return Promise.resolve(new Response('[]',{status:200}));
    });
    vi.stubGlobal('fetch',browserFetch);
    try {
      await expect(new HttpSubscriptionService().list()).resolves.toEqual([]);
      expect(browserFetch).toHaveBeenCalledWith('/api/subscriptions',expect.objectContaining({method:'GET'}));
    } finally { vi.unstubAllGlobals(); }
  });
  it('encodes names, sends opaque revisions and normalizes responses',async()=>{
    const transport=vi.fn().mockResolvedValue(new Response(JSON.stringify({subscription:subscriptions[0]}),{status:200}));
    const service=new HttpSubscriptionService('/backend',transport);
    await service.update('a/b',input,'opaque');
    expect(transport).toHaveBeenCalledWith('/backend/subscriptions/a%2Fb',expect.objectContaining({method:'PUT',headers:expect.objectContaining({'If-Match':'"opaque"'})}));
  });
  it.each([[401,'unauthorized'],[403,'forbidden'],[404,'not_found'],[409,'conflict'],[412,'conflict'],[422,'validation'],[503,'unavailable']])('maps %s safely',async(status,code)=>{
    const service=new HttpSubscriptionService('/api',vi.fn().mockResolvedValue(new Response('raw cluster error',{status:Number(status)})));
    await expect(service.list()).rejects.toMatchObject({code});
  });
  it('rejects malformed payloads and connection failures',async()=>{
    await expect(new HttpSubscriptionService('/api',vi.fn().mockResolvedValue(new Response('{}'))).list()).rejects.toMatchObject({code:'invalid_response'});
    await expect(new HttpSubscriptionService('/api',vi.fn().mockRejectedValue(new Error('secret URL'))).list()).rejects.toMatchObject({code:'unavailable'});
  });
});
