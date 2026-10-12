import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createApi } from '../api.mjs';
import { GitResourceStore } from '../GitResourceStore.mjs';
import { createTestStore, removeTestStore } from '../test-support.mjs';
import { hasNamespace } from '../../shared/public-data.mjs';
const input={name:'tenant1',domains:['tenant1.example.com'],identityProvider:{title:'Tenant 1 SSO',description:'Tenant 1 identity provider',
  config:{clientId:'tenant1-client',clientSecretSecret:{name:'tenant1-oidc-secret'},issuer:'https://idp.example.com/realms/tenant1',
    authorizationUrl:'https://idp.example.com/auth',tokenUrl:'https://idp.example.com/token'}}};
async function setup(t) {
  const store=await createTestStore();t.after(()=>removeTestStore(store));const api=createApi(store);
  const request=(path,method='GET',body,revision)=>api(new Request(`http://localhost/api${path}`,{method,
    headers:{...(body ? {'Content-Type':'application/json'} : {}),...(revision ? {'If-Match':JSON.stringify(revision)} : {})},
    ...(body ? {body:JSON.stringify(body)} : {})}));
  return {store,request};
}
test('tenant and IdP CRUD saves atomically, survives restart and exposes no namespace or break-glass credentials',async t=>{
  const {store,request}=await setup(t);assert.deepEqual(await (await request('/tenants')).json(),[]);
  const created=await request('/tenants','POST',input);assert.equal(created.status,201);
  const tenant=await created.json();assert.equal(tenant.status,'Saved');assert.equal(hasNamespace(tenant),false);
  assert.equal(tenant.identityProvider.enabled,true);assert.equal(tenant.identityProvider.config.validateSignature,true);
  assert.equal(created.headers.get('etag'),JSON.stringify(tenant.revision));assert.equal(created.headers.get('location'),'/api/tenants/tenant1');
  assert.ok(!JSON.stringify(tenant).toLowerCase().includes('breakglass'));
  const file=join(store.directory,'tenants/maas/tenant1.json');const resource=JSON.parse(await readFile(file,'utf8'));
  assert.equal(resource.metadata.namespace,'maas');assert.deepEqual(resource.spec.identityProvider,tenant.identityProvider);
  assert.equal(resource.spec.identityProvider.config.clientSecretSecret.name,'tenant1-oidc-secret');
  assert.equal(await store.git('diff','--cached','--name-only'),'');
  const restart=new GitResourceStore({directory:store.directory});await restart.initialize();
  const loaded=await createApi(restart)(new Request('http://localhost/api/tenants/tenant1'));assert.equal(loaded.status,200);
  assert.deepEqual(await loaded.json(),tenant);
  const updated=await request('/tenants/tenant1','PUT',{...input,domains:['changed.example.com']},tenant.revision);assert.equal(updated.status,200);
  const next=await updated.json();assert.notEqual(next.revision,tenant.revision);assert.equal(next.creationTimestamp,tenant.creationTimestamp);
  assert.equal((await request('/tenants/tenant1','DELETE',undefined,tenant.revision)).status,412);
  assert.equal((await request('/tenants/tenant1','DELETE')).status,428);
  assert.equal((await request('/tenants/tenant1','DELETE',undefined,next.revision)).status,204);
  assert.equal((await request('/tenants/tenant1')).status,404);await assert.rejects(readFile(file),{code:'ENOENT'});
  assert.equal((await request('/tenants','POST',input)).status,201);
});
test('rejects duplicates, overlapping domains, partial IdP configurations and credential values without partial creation',async t=>{
  const {store,request}=await setup(t);
  for(const change of [{name:'../escape'},{domains:['invalid']},{domains:['one.example.com','ONE.example.com']},{identityProvider:{}},
    {identityProvider:{...input.identityProvider,config:{...input.identityProvider.config,issuer:'javascript:alert(1)'}}},
    {identityProvider:{...input.identityProvider,config:{...input.identityProvider.config,clientSecret:'actual-secret'}}},
    {namespace:'other'},{breakGlass:true}]) {
    assert.equal((await request('/tenants','POST',{...input,...change})).status,422);
  }
  assert.equal((await store.snapshot()).tenants.length,0);
  assert.equal((await request('/tenants','POST',input)).status,201);
  assert.equal((await request('/tenants','POST',input)).status,409);
  assert.equal((await request('/tenants','POST',{...input,name:'tenant2'})).status,409);
  assert.equal((await request('/tenants','POST',{...input,name:'tenant2',domains:[]})).status,201);
  assert.equal((await request('/tenants/tenant1','PUT',input)).status,428);
  assert.equal((await request('/tenants/tenant1','PUT',{...input,name:'renamed'},'stale')).status,422);
  assert.equal((await request('/tenants/tenant1','PATCH',input)).status,405);
});
test('failed storage writes leave no tenant or partial identity provider',async t=>{
  const {store,request}=await setup(t);const original=store.atomicWrite.bind(store);
  store.atomicWrite=async(path,content)=>{if(path.startsWith('tenants/'))throw new Error('Simulated tenant storage failure');return original(path,content);};
  assert.equal((await request('/tenants','POST',input)).status,503);assert.equal((await store.snapshot()).tenants.length,0);
  store.atomicWrite=original;assert.equal((await request('/tenants','POST',input)).status,201);
  const file=join(store.directory,'tenants/maas/tenant1.json');await writeFile(file,'{}');
  assert.equal((await request('/tenants')).status,503);
});
