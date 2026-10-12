import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitResourceStore } from '../GitResourceStore.mjs';
import { createApi } from '../api.mjs';
import { hasNamespace } from '../../shared/public-data.mjs';

test('REST uses names only while CRs use the configured default namespace',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'maas-default-namespace-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const store=new GitResourceStore({directory,namespace:'model-space'});await store.initialize();
  const api=createApi(store);
  const request=(path,method='GET',body,revision)=>api(new Request(`http://localhost/api${path}`,{method,
    headers:{...(body ? {'Content-Type':'application/json'} : {}),...(revision ? {'If-Match':JSON.stringify(revision)} : {})},
    ...(body ? {body:JSON.stringify(body)} : {})}));
  const read=async path=>JSON.parse(await readFile(join(directory,path),'utf8'));
  const input={name:'widget',displayName:'Widget',modelUri:'hf://org/widget',modelName:'org/widget',
    runtimeImage:'registry.example/runtime:test',replicas:1,cpu:'2',memory:'4Gi',gpuCount:0,runtimeArgs:[],locations:['site1']};
  const response=await request('/models','POST',input);assert.equal(response.status,201);
  assert.equal(response.headers.get('location'),'/api/models/widget');
  const model=await response.json();assert.equal(hasNamespace(model),false);
  const deployment=await read('deployments/model-space/widget.json');
  assert.equal(deployment.metadata.namespace,'model-space');
  assert.equal((await read('models/model-space/widget.json')).metadata.namespace,'model-space');
  assert.equal((await read('placements/model-space/widget.json')).metadata.namespace,'model-space');
  const work=await read('manifest-work-replica-sets/model-space/widget.json');
  assert.equal(work.metadata.namespace,'model-space');
  assert.equal(work.spec.manifestWorkTemplate.workload.manifests[0].metadata.namespace,'model-space');
  // A same-named foreign resource stays invisible and cannot be addressed through the API.
  const foreign={apiVersion:'maas.opendatahub.io/v1alpha1',kind:'MaaSModelRef',metadata:{name:'widget',namespace:'other'},spec:{modelRef:{kind:'LLMInferenceService',name:'widget'}}};
  await store.atomicWrite('models/other/widget.json',JSON.stringify(foreign));
  const rows=await (await request('/models')).json();assert.equal(rows.length,4);assert.equal(rows.filter(row=>row.name==='widget').length,1);
  assert.equal((await request('/models/other/widget')).status,404);
  const subInput={name:'consumer',priority:0,owner:{groups:[{name:'consumer'}]},modelRefs:[{name:'widget',tokenRateLimits:[{limit:1000,window:'1h'}]}],createAuthPolicy:true};
  const created=await request('/subscriptions','POST',subInput);assert.equal(created.status,201);
  const result=await created.json();assert.equal(hasNamespace(result),false);
  const sub=await read('subscriptions/model-space/consumer.json');
  assert.equal(sub.metadata.namespace,'model-space');assert.equal(sub.spec.modelRefs[0].namespace,'model-space');
  const policy=await read('authorization-policies/model-space/consumer-policy.json');
  assert.equal(policy.metadata.namespace,'model-space');assert.equal(policy.spec.modelRefs[0].namespace,'model-space');
  for(const path of ['/models','/models/widget','/subscriptions','/subscriptions/consumer']) {
    const response=await request(path);assert.equal(response.status,200);assert.equal(hasNamespace(await response.json()),false,path);
  }
  assert.equal((await request('/models','POST',{...input,name:'other-model',namespace:'other'})).status,422);
  assert.equal((await request('/subscriptions','POST',{...subInput,name:'other-sub',modelRefs:[{...subInput.modelRefs[0],namespace:'other'}]})).status,422);
  assert.equal((await request('/models/widget','DELETE',undefined,model.revision)).status,409);
  assert.equal((await request('/subscriptions/consumer','DELETE',undefined,result.subscription.revision)).status,204);
  assert.equal((await request('/models/widget','DELETE',undefined,model.revision)).status,204);
  assert.deepEqual((await read('models/other/widget.json')),foreign);
});
