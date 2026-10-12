import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createApi } from '../api.mjs';
import { GitResourceStore } from '../GitResourceStore.mjs';
import { createTestStore, removeTestStore } from '../test-support.mjs';
const input={name:'new-model',displayName:'New model',description:'Test deployment',modelUri:'hf://org/model',modelName:'org/model',
  runtimeImage:'registry.example/vllm:test',replicas:2,cpu:'500m',memory:'4Gi',gpuCount:1,locations:['site1','site2'],runtimeArgs:['# comment','--max-model-len=2048','']};
async function setup(t) {
  const store=await createTestStore();t.after(()=>removeTestStore(store));
  const handler=createApi(store);
  const request=(path,method='GET',body,revision)=>handler(new Request(`http://localhost/api${path}`,{method,
    headers:{...(body ? {'Content-Type':'application/json'} : {}),...(revision ? {'If-Match':JSON.stringify(revision)} : {})},
    ...(body ? {body:JSON.stringify(body)} : {})}));
  return {store,request};
}
test('model creation persists deployment, registration and placement, survives restart and deletes all resources',async t=>{
  const {store,request}=await setup(t);
  assert.equal((await (await request('/models')).json()).length,3);
  const response=await request('/models','POST',input);assert.equal(response.status,201);
  const result=await response.json();assert.equal(result.namespace,undefined);assert.deepEqual(result.modelRef,{kind:'LLMInferenceService',name:'new-model'});
  assert.deepEqual(result.locations,['site1','site2']);
  assert.equal(response.headers.get('etag'),JSON.stringify(result.revision));
  const cr=JSON.parse(await readFile(join(store.directory,'deployments/maas/new-model.json'),'utf8'));
  assert.equal(cr.kind,'LLMInferenceService');assert.equal(cr.apiVersion,'serving.kserve.io/v1alpha2');
  assert.deepEqual(cr.spec.model,{uri:input.modelUri,name:input.modelName});assert.equal(cr.spec.replicas,2);
  assert.deepEqual(cr.spec.router.gateway.refs,[{name:'maas-default-gateway',namespace:'openshift-ingress'}]);
  assert.equal(cr.spec.template.containers[0].env[0].value,'--max-model-len=2048');
  assert.equal(cr.spec.template.containers[0].resources.limits['nvidia.com/gpu'],'1');
  const model=JSON.parse(await readFile(join(store.directory,'models/maas/new-model.json'),'utf8'));
  assert.deepEqual(model.spec.modelRef,{kind:'LLMInferenceService',name:'new-model'});
  const placement=JSON.parse(await readFile(join(store.directory,'placements/maas/new-model.json'),'utf8'));
  assert.equal(placement.apiVersion,'cluster.open-cluster-management.io/v1beta1');
  assert.deepEqual(placement.spec.predicates,[{requiredClusterSelector:{labelSelector:{matchLabels:{'ai-grid/enabled':'true','ai-grid/provisioned':'true'},matchExpressions:[{key:'location',operator:'In',values:input.locations}]}}}]);
  assert.equal(placement.spec.numberOfClusters,undefined); // All matching clusters, rather than a fixed count.
  const work=JSON.parse(await readFile(join(store.directory,'manifest-work-replica-sets/maas/new-model.json'),'utf8'));
  assert.deepEqual(work.spec.placementRefs,[{name:'new-model',rolloutStrategy:{type:'All'}}]);
  assert.deepEqual(work.spec.manifestWorkTemplate.workload.manifests,[cr]);
  assert.ok((await (await request('/models')).json()).some(m=>m.name==='new-model'));
  assert.equal((await request('/models','POST',input)).status,409);
  assert.equal(await store.git('diff','--cached','--name-only'),'');
  const restart=new GitResourceStore({directory:store.directory});await restart.initialize();
  const rows=await (await createApi(restart)(new Request('http://localhost/api/models'))).json();
  assert.equal(rows.find(m=>m.name==='new-model').revision,result.revision);
  assert.deepEqual(rows.find(m=>m.name==='new-model').locations,input.locations);
  const info=await request('/models/new-model');assert.equal(info.headers.get('etag'),response.headers.get('etag'));
  assert.equal((await request('/models/new-model','DELETE')).status,428);
  assert.equal((await request('/models/new-model','DELETE',undefined,'stale')).status,412);
  assert.equal((await request('/models/new-model','DELETE',undefined,result.revision)).status,204);
  assert.equal((await request('/models/new-model')).status,404);
  assert.equal((await store.snapshot()).deployments.length,0);
  assert.equal((await store.snapshot()).placements.length,0);
  assert.equal((await store.snapshot()).works.length,0);
  assert.ok(!(await (await request('/models')).json()).some(m=>m.name==='new-model'));
});
test('publication is automatic, old deployment routes are removed and legacy catalog entries remain manageable',async t=>{
  const {store,request}=await setup(t);
  assert.equal((await request('/models','POST',{...input,publishAsMaaS:false})).status,422);
  assert.equal((await request('/deployments')).status,404);
  assert.equal((await request('/deployments','POST',input)).status,404);
  const response=await request('/models/granite-3-8b');assert.equal(response.status,200);
  const model=await response.json();assert.equal(model.hasDeployment,false);assert.equal(model.availableForSubscriptions,true);
  assert.equal(model.modelUri,undefined);
  assert.deepEqual(model.locations,[]);
  assert.equal((await request('/models/granite-3-8b','DELETE',undefined,model.revision)).status,204);
  assert.equal((await store.snapshot()).models.length,2);
});
test('model edits invalidate deletion revisions and references in any namespace block deletion',async t=>{
  const {store,request}=await setup(t);
  const modelResult=await (await request('/models','POST',input)).json();
  const modelPath=join(store.directory,'models/maas/new-model.json');
  const model=JSON.parse(await readFile(modelPath,'utf8'));model.spec.endpointOverride='https://example.test';
  await writeFile(modelPath,JSON.stringify(model));
  assert.equal((await request('/models/new-model','DELETE',undefined,modelResult.revision)).status,412);
  const current=await (await request('/models/new-model')).json();
  const policy={apiVersion:'maas.opendatahub.io/v1alpha1',kind:'MaaSAuthPolicy',metadata:{name:'foreign-policy',namespace:'other'},
    spec:{modelRefs:[{name:'new-model',namespace:'maas'}],subjects:{groups:[{name:'engineering'}]}}};
  await store.atomicWrite('authorization-policies/other/foreign-policy.json',JSON.stringify(policy));
  const blocked=await request('/models/new-model','DELETE',undefined,current.revision);
  assert.equal(blocked.status,409);assert.equal((await store.snapshot()).deployments.length,1);
  assert.equal((await request('/models/new-model')).status,200);
});
test('rejects invalid input and rolls back both resources if registration fails',async t=>{
  const {store,request}=await setup(t);
  for(const change of [{name:'../escape'},{modelUri:'file:///tmp/model'},{replicas:0},{gpuCount:0.5},{cpu:'0'},{memory:'whatever'},{namespace:'other'},
    {locations:[]},{locations:['unknown']},{locations:['site1','site1']},{locations:['bad location']},{locations:undefined}]) {
    assert.equal((await request('/models','POST',{...input,...change})).status,422);
  }
  const original=store.atomicWrite.bind(store);
  store.atomicWrite=async(path,content)=>{if(path.startsWith('models/maas/'))throw new Error('Test registration write failure');return original(path,content);};
  assert.equal((await request('/models','POST',input)).status,503);
  assert.equal((await store.snapshot()).deployments.length,0);assert.equal((await store.snapshot()).models.length,3);
  store.atomicWrite=original;
  assert.equal((await request('/models','POST',input)).status,201);
});
test('locations come only from Ready, provisioned AI Grid nodes and reject unprovisioned sites',async t=>{
  const {store,request}=await setup(t);
  assert.deepEqual(await (await request('/locations')).json(),['site1','site2','site3']);
  assert.equal((await request('/locations','POST',[])).status,405);
  assert.equal((await request('/models','POST',{...input,locations:['site4']})).status,422);
  assert.equal((await request('/clusters/site4','PATCH',{aiGridEnabled:true})).status,200);
  assert.deepEqual(await (await request('/locations')).json(),['site1','site2','site3']);
  const path=join(store.directory,'clusters/site4.json');const cluster=JSON.parse(await readFile(path,'utf8'));
  cluster.metadata.labels['ai-grid/provisioned']='true';await writeFile(path,JSON.stringify(cluster));
  assert.deepEqual(await (await request('/locations')).json(),['site1','site2','site3','site4']);
  assert.equal((await request('/models','POST',{...input,locations:['site4']})).status,201);
  cluster.status.conditions[0].status='False';await writeFile(path,JSON.stringify(cluster));
  assert.deepEqual(await (await request('/locations')).json(),['site1','site2','site3']);
});
test('placement and workload edits invalidate deletion revisions',async t=>{
  const {store,request}=await setup(t);
  let model=await (await request('/models','POST',input)).json();
  const placementPath=join(store.directory,'placements/maas/new-model.json');
  const placement=JSON.parse(await readFile(placementPath,'utf8'));
  placement.spec.predicates[0].requiredClusterSelector.labelSelector.matchExpressions[0].values=['site3'];
  await writeFile(placementPath,JSON.stringify(placement));
  assert.equal((await request('/models/new-model','DELETE',undefined,model.revision)).status,412);
  model=await (await request('/models/new-model')).json();
  assert.deepEqual(model.locations,['site3']);
  const workPath=join(store.directory,'manifest-work-replica-sets/maas/new-model.json');
  const work=JSON.parse(await readFile(workPath,'utf8'));work.spec.manifestWorkTemplate.workload.manifests[0].spec.replicas=3;
  await writeFile(workPath,JSON.stringify(work));
  assert.equal((await request('/models/new-model','DELETE',undefined,model.revision)).status,412);
});
test('failure writing placement distribution rolls back every model resource',async t=>{
  const {store,request}=await setup(t);
  const original=store.atomicWrite.bind(store);
  store.atomicWrite=async(path,content)=>{if(path.startsWith('manifest-work-replica-sets/'))throw new Error('Test distribution write failure');return original(path,content);};
  assert.equal((await request('/models','POST',input)).status,503);
  const snapshot=await store.snapshot();
  assert.equal(snapshot.models.length,3);assert.equal(snapshot.deployments.length,0);assert.equal(snapshot.placements.length,0);assert.equal(snapshot.works.length,0);
});
