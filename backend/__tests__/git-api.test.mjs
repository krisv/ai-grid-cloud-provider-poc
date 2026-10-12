import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, chmod, symlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitResourceStore } from '../GitResourceStore.mjs';
import { createApi } from '../api.mjs';
const input={name:'engineering',displayName:'Engineering',description:'Original description',priority:10,owner:{groups:[{name:'engineering'}],users:['alice']},
  modelRefs:[{name:'granite-3-8b',displayName:'Granite',tokenRateLimits:[{limit:1000,window:'1h'}],billingRate:{perToken:'0.000002'},guardrails:[{ref:{name:'model-safety'}}]}],
  tokenMetadata:{organizationId:'osac',labels:{department:'engineering'}},inferencePriority:-5,guardrails:[{ref:{name:'safety'},checks:['pii']}],createAuthPolicy:true};
async function setup(t,options={}) {
  const parent=await mkdtemp(join(tmpdir(),'maas-git-test-'));t.after(()=>rm(parent,{recursive:true,force:true}));
  const store=new GitResourceStore({directory:join(parent,'resources'),autoCommit:true,...options});await store.initialize();
  const api=createApi(store);
  const request=(path,method='GET',body,revision)=>api(new Request(`http://localhost/api${path}`,{method,
    headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(revision ? {'If-Match':JSON.stringify(revision)}:{})},
    ...(body!==undefined?{body:JSON.stringify(body)}:{})}));
  return {parent,store,request};
}
const editable=subscription=>({displayName:subscription.displayName,description:subscription.description,priority:subscription.priority,
  owner:subscription.owner,modelRefs:subscription.modelRefs,tokenMetadata:subscription.tokenMetadata,inferencePriority:subscription.inferencePriority,guardrails:subscription.guardrails});
test('HTTP contract CRUD persists valid CRs with Git history and cleans up generated policies',async t=>{
  const {store,request}=await setup(t);
  assert.equal((await request('/health')).status,200);
  assert.equal((await (await request('/models')).json()).length,3);
  assert.equal((await request('/groups')).status,404);
  assert.deepEqual(await (await request('/subscriptions')).json(),[]);
  const created=await request('/subscriptions','POST',input);assert.equal(created.status,201);
  const {subscription,authPolicy}=await created.json();assert.equal(authPolicy.name,'engineering-policy');assert.equal(subscription.phase,'Saved');
  assert.equal(created.headers.get('etag'),JSON.stringify(subscription.revision));
  const file=join(store.directory,'subscriptions/maas/engineering.json');
  const cr=JSON.parse(await readFile(file,'utf8'));
  assert.equal(cr.apiVersion,'maas.opendatahub.io/v1alpha1');assert.equal(cr.kind,'MaaSSubscription');
  assert.equal(cr.metadata.namespace,'maas');assert.equal(cr.metadata.annotations['openshift.io/display-name'],'Engineering');
  assert.equal(cr.spec.modelRefs[0].displayName,undefined);assert.equal(cr.spec.createAuthPolicy,undefined);assert.equal(cr.revision,undefined);assert.equal(cr.status,undefined);
  assert.equal(cr.spec.modelRefs[0].billingRate.perToken,'0.000002');
  assert.equal(await store.git('rev-list','--count','HEAD'),'2');assert.equal(await store.git('status','--porcelain'),'');
  const info=await (await request('/subscriptions/engineering')).json();assert.equal(info.modelRefs[0].name,'granite-3-8b');assert.equal(info.authPolicies[0].name,'engineering-policy');
  const restart=new GitResourceStore({directory:store.directory});await restart.initialize();
  const reload=await createApi(restart)(new Request('http://localhost/api/subscriptions'));assert.equal((await reload.json())[0].name,'engineering');
  const response=await request('/subscriptions/engineering','PUT',{...editable(subscription),displayName:'Updated',description:'New description',name:'renamed'},subscription.revision);
  assert.equal(response.status,200);const updated=(await response.json()).subscription;
  assert.equal(updated.name,'engineering');assert.equal(updated.namespace,undefined);assert.notEqual(updated.revision,subscription.revision);
  const stale=await request('/subscriptions/engineering','PUT',editable(subscription),subscription.revision);assert.equal(stale.status,412);
  assert.equal((await request('/subscriptions/engineering','DELETE',undefined,subscription.revision)).status,412);
  assert.equal((await request('/subscriptions/engineering','DELETE',undefined,updated.revision)).status,204);
  assert.equal((await request('/subscriptions/engineering')).status,404);
  assert.equal((await store.snapshot()).policies.length,0);
  assert.equal((await request('/authorization-policies')).status,404);
  assert.equal(await store.git('rev-list','--count','HEAD'),'4');assert.equal(await store.git('status','--porcelain'),'');
});
test('preserves opaque CR fields, owner users, billing, unlimited access and metadata on unrelated updates',async t=>{
  const {store,request}=await setup(t);
  const created=await request('/subscriptions','POST',{...input,modelRefs:[{...input.modelRefs[0],unlimited:true,tokenRateLimits:[]}]});assert.equal(created.status,201);
  let file=join(store.directory,'subscriptions/maas/engineering.json');let cr=JSON.parse(await readFile(file,'utf8'));
  assert.equal(cr.spec.modelRefs[0].tokenRateLimits,undefined);
  cr.metadata.labels={custom:'preserved'};cr.metadata.annotations.custom='annotation';cr.spec.futureConfig={flag:true};
  await writeFile(file,JSON.stringify(cr,null,2)+'\n');await store.git('add','--','subscriptions');await store.commit('Add future CR configuration');
  const old=(await (await request('/subscriptions/engineering')).json()).subscription;
  const result=await request('/subscriptions/engineering','PUT',{priority:22,owner:{groups:old.owner.groups},modelRefs:old.modelRefs.map(({billingRate,guardrails,...rest})=>rest)},old.revision);
  assert.equal(result.status,200);cr=JSON.parse(await readFile(file,'utf8'));
  assert.deepEqual(cr.spec.owner.users,['alice']);assert.equal(cr.spec.inferencePriority,-5);assert.deepEqual(cr.spec.guardrails,input.guardrails);
  assert.equal(cr.spec.modelRefs[0].billingRate.perToken,'0.000002');assert.deepEqual(cr.spec.modelRefs[0].guardrails,input.modelRefs[0].guardrails);
  assert.equal(cr.spec.modelRefs[0].unlimited,true);assert.equal(cr.spec.modelRefs[0].tokenRateLimits,undefined);
  assert.deepEqual(cr.spec.tokenMetadata,input.tokenMetadata);assert.deepEqual(cr.spec.futureConfig,{flag:true});
  assert.deepEqual(cr.metadata.labels,{custom:'preserved'});assert.equal(cr.metadata.annotations.custom,'annotation');assert.equal(cr.metadata.annotations['openshift.io/description'],undefined);
});
test('validation, name safety, missing revisions and duplicate identities cause no writes',async t=>{
  const {store,request}=await setup(t);
  for(const change of [{name:'../escape'},{priority:1.5},{owner:{groups:[]}},{modelRefs:[]},{modelRefs:[{...input.modelRefs[0],namespace:'../escape'}]},
    {modelRefs:[{...input.modelRefs[0],tokenRateLimits:[{limit:0,window:'1h'}]}]},{modelRefs:[{...input.modelRefs[0],tokenRateLimits:[{limit:1,window:'10000h'}]}]},
    {modelRefs:[{...input.modelRefs[0],unlimited:true}]}])assert.equal((await request('/subscriptions','POST',{...input,...change})).status,422);
  assert.equal(await store.git('rev-list','--count','HEAD'),'1');
  assert.equal((await request('/subscriptions','POST',input)).status,201);
  assert.equal((await request('/subscriptions','POST',input)).status,409);
  assert.equal((await request('/subscriptions/engineering','PUT',editable(input))).status,428);
  assert.equal((await request('/subscriptions/engineering','DELETE')).status,428);
  assert.equal((await request('/subscriptions/%2e%2e%2fescape')).status,422);
  assert.equal((await request('/subscriptions/engineering','PATCH',{})).status,405);
  assert.equal(await store.git('rev-list','--count','HEAD'),'2');
});
test('competing updates serialize and reject a stale revision',async t=>{
  const {request}=await setup(t);const old=(await (await request('/subscriptions','POST',input)).json()).subscription;
  const responses=await Promise.all([request('/subscriptions/engineering','PUT',{...editable(old),priority:11},old.revision),request('/subscriptions/engineering','PUT',{...editable(old),priority:12},old.revision)]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,412]);
});
test('delete removes generated policy and allows same-name re-creation',async t=>{
  const {store,request}=await setup(t);const old=(await (await request('/subscriptions','POST',input)).json()).subscription;
  assert.equal((await request('/subscriptions/engineering','DELETE',undefined,old.revision)).status,204);
  assert.deepEqual((await store.snapshot()).policies,[]);
  assert.equal((await request('/subscriptions','POST',input)).status,201);
  assert.equal(await store.git('status','--porcelain'),'');
});
test('legacy orphaned generated policies are replaced with the new subscription configuration',async t=>{
  const {store,request}=await setup(t,{autoCommit:false});
  const policy={apiVersion:'maas.opendatahub.io/v1alpha1',kind:'MaaSAuthPolicy',metadata:{name:'engineering-policy',namespace:'maas',
    annotations:{'openshift.io/description':'Auth policy created for subscription "engineering"','maas-admin.portal/created-at':'2026-10-09T12:00:00Z'}},
    spec:{modelRefs:[],subjects:{groups:[{name:'old-group'}]}}};
  await store.atomicWrite('authorization-policies/maas/engineering-policy.json',JSON.stringify(policy));
  const response=await request('/subscriptions','POST',input);assert.equal(response.status,201);
  assert.deepEqual((await response.json()).authPolicy.subjects,input.owner);
  const snapshot=await store.snapshot();assert.equal(snapshot.policies.length,1);
  assert.equal(snapshot.policies[0].resource.metadata.annotations['maas-admin.portal/subscription'],'engineering');
});
test('independent policies survive deletion and name collisions never create a partial subscription',async t=>{
  const {store,request}=await setup(t,{autoCommit:false});
  const policy={apiVersion:'maas.opendatahub.io/v1alpha1',kind:'MaaSAuthPolicy',metadata:{name:'engineering-policy',namespace:'maas'},
    spec:{modelRefs:input.modelRefs.map(({name,namespace})=>({name,namespace})),subjects:input.owner}};
  const content=JSON.stringify(policy);const path='authorization-policies/maas/engineering-policy.json';
  await store.atomicWrite(path,content);
  assert.equal((await request('/subscriptions','POST',input)).status,409);
  assert.deepEqual(await (await request('/subscriptions')).json(),[]);
  const created=await request('/subscriptions','POST',{...input,createAuthPolicy:false});
  assert.equal(created.status,201);const old=(await created.json()).subscription;
  assert.equal((await request('/subscriptions/engineering','DELETE',undefined,old.revision)).status,204);
  assert.equal(await readFile(join(store.directory,path),'utf8'),content);
});
test('failed deletion commits roll back both subscription and generated policy',async t=>{
  const {store,request}=await setup(t);
  const old=(await (await request('/subscriptions','POST',input)).json()).subscription;
  const hook=join(store.directory,'.git/hooks/pre-commit');await writeFile(hook,'#!/bin/sh\nexit 1\n');await chmod(hook,0o755);
  assert.equal((await request('/subscriptions/engineering','DELETE',undefined,old.revision)).status,503);
  const snapshot=await store.snapshot();assert.equal(snapshot.subscriptions.length,1);assert.equal(snapshot.policies.length,1);
  assert.equal(snapshot.subscriptions[0].revision,old.revision);assert.equal(await store.git('status','--porcelain'),'');
});
test('failed Git commits roll back both resources and the index',async t=>{
  const {store,request}=await setup(t);
  const hook=join(store.directory,'.git/hooks/pre-commit');await writeFile(hook,'#!/bin/sh\nexit 1\n');await chmod(hook,0o755);
  const failed=await request('/subscriptions','POST',input);assert.equal(failed.status,503);
  assert.deepEqual(await (await request('/subscriptions')).json(),[]);assert.deepEqual((await store.snapshot()).policies,[]);
  assert.equal(await store.git('status','--porcelain'),'');assert.equal(await store.git('rev-list','--count','HEAD'),'1');
  await rm(hook);assert.equal((await request('/subscriptions','POST',input)).status,201);
});
test('automatic commits refuse a dirty working tree; file-only mode leaves changes for manual commits',async t=>{
  const {store,request}=await setup(t);await writeFile(join(store.directory,'manual.txt'),'manual change');
  assert.equal((await request('/subscriptions','POST',input)).status,409);assert.equal(await readFile(join(store.directory,'manual.txt'),'utf8'),'manual change');
  const fileOnly=new GitResourceStore({directory:store.directory,autoCommit:false});await fileOnly.initialize();
  assert.equal((await createApi(fileOnly)(new Request('http://localhost/api/subscriptions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}))).status,201);
  assert.equal(await store.git('rev-list','--count','HEAD'),'1');assert.ok((await store.git('status','--porcelain')).includes('subscriptions'));
});
test('malformed JSON requests, malformed stored resources and symlinks fail safely',async t=>{
  const {store,request}=await setup(t);const handle=createApi(store);
  assert.equal((await handle(new Request('http://localhost/api/subscriptions',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'}))).status,400);
  const file=join(store.directory,'models/maas/granite-3-8b.json');const original=await readFile(file,'utf8');
  await writeFile(file,'not json');const failed=await request('/models');assert.equal(failed.status,503);assert.equal((await failed.json()).code,'unavailable');
  await writeFile(file,original);const external=join(store.directory,'../external.json');await writeFile(external,'secret');
  await symlink(external,join(store.directory,'models/maas/escape.json'));assert.equal((await request('/models')).status,409);assert.equal(await readFile(external,'utf8'),'secret');
});
test('long resource names use filesystem-safe filenames and policy suffix limits are explicit',async t=>{
  const {request}=await setup(t);const name='a'.repeat(253);
  assert.equal((await request('/subscriptions','POST',{...input,name})).status,422);
  const response=await request('/subscriptions','POST',{...input,name,createAuthPolicy:false});assert.equal(response.status,201);
  assert.equal((await request(`/subscriptions/${name}`)).status,200);
});
test('initialization never repurposes an unrelated directory',async t=>{
  const parent=await mkdtemp(join(tmpdir(),'maas-init-test-'));t.after(()=>rm(parent,{recursive:true,force:true}));await writeFile(join(parent,'keep.txt'),'important');
  const store=new GitResourceStore({directory:parent});await assert.rejects(store.initialize(),/must be empty/);assert.equal(await readFile(join(parent,'keep.txt'),'utf8'),'important');
});

test('default file-only mode never stages or commits and rolls back a multi-file write failure',async t=>{
  const {store,request}=await setup(t,{autoCommit:false});
  await assert.rejects(store.git('rev-parse','--verify','HEAD'));
  assert.equal(await store.git('diff','--cached','--name-only'),'');
  const write=store.atomicWrite.bind(store);
  store.atomicWrite=async(path,content)=>{
    if(path.startsWith('authorization-policies/'))throw new Error('Simulated filesystem write failure');
    return write(path,content);
  };
  assert.equal((await request('/subscriptions','POST',input)).status,503);
  assert.deepEqual(await (await request('/subscriptions')).json(),[]);
  assert.deepEqual((await store.snapshot()).policies,[]);
  store.atomicWrite=write;
  assert.equal((await request('/subscriptions','POST',input)).status,201);
  assert.equal(await store.git('diff','--cached','--name-only'),'');
  await assert.rejects(store.git('rev-parse','--verify','HEAD'));
});
