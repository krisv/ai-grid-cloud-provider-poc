import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { GitResourceStore } from '../GitResourceStore.mjs';
import { createApi } from '../api.mjs';
import { ACMHubClient } from '../ACMHubClient.mjs';
import { createTestStore, removeTestStore } from '../test-support.mjs';
import { seedClusters } from '../../shared/grid-clusters.mjs';
const setup=async t=>{
  const store=await createTestStore();t.after(()=>removeTestStore(store));const api=createApi(store,{env:{}});
  const request=(path,method='GET',body)=>api(new Request(`http://localhost/api${path}`,{method,
    headers:body ? {'Content-Type':'application/json'} : {},...(body ? {body:JSON.stringify(body)} : {})}));
  return {store,request};
};
test('no Hub configuration uses Git with three provisioned sites and one available site',async t=>{
  const {store,request}=await setup(t);const response=await request('/clusters');assert.equal(response.status,200);
  const clusters=await response.json();assert.equal(clusters.length,4);
  for(const cluster of clusters.slice(0,3)) {assert.equal(cluster.provisioned,true);assert.equal(cluster.aiGridEnabled,true);assert.equal(cluster.status,'Ready');}
  assert.deepEqual(clusters[3],{name:'site4',location:'site4',status:'Ready',aiGridEnabled:false,provisioned:false,provisioningStatus:'Not provisioned'});
  assert.deepEqual(await (await request('/locations')).json(),['site1','site2','site3']);
  const enrolled=await request('/clusters/site4','PATCH',{aiGridEnabled:true});assert.equal(enrolled.status,200);
  assert.equal((await enrolled.json()).provisioningStatus,'Provisioning');
  const path=join(store.directory,'clusters/site4.json');const cluster=JSON.parse(await readFile(path,'utf8'));
  assert.equal(cluster.metadata.labels['ai-grid/enabled'],'true');assert.equal(cluster.metadata.labels['ai-grid/provisioned'],'false');
  cluster.metadata.labels['ai-grid/provisioned']='true';await writeFile(path,JSON.stringify(cluster));
  assert.equal((await (await request('/clusters')).json())[3].provisioningStatus,'Provisioned');
  assert.deepEqual(await (await request('/locations')).json(),['site1','site2','site3','site4']);
  const restart=new GitResourceStore({directory:store.directory});await restart.initialize();
  assert.deepEqual(await (await createApi(restart,{env:{}})(new Request('http://localhost/api/locations'))).json(),['site1','site2','site3','site4']);
  assert.equal(await store.git('diff','--cached','--name-only'),'');
});
test('locations exclude unavailable and unprovisioned nodes and deduplicate location labels',async t=>{
  const {store,request}=await setup(t);
  const first=seedClusters()[0];first.metadata.name='another-node';
  await store.atomicWrite('clusters/another-node.json',JSON.stringify(first));
  assert.deepEqual(await (await request('/locations')).json(),['site1','site2','site3']);
  const second=JSON.parse(await readFile(join(store.directory,'clusters/site2.json'),'utf8'));second.status.conditions[0].status='False';
  await store.atomicWrite('clusters/site2.json',JSON.stringify(second));
  assert.deepEqual(await (await request('/locations')).json(),['site1','site3']);
  assert.equal((await request('/clusters/missing','PATCH',{aiGridEnabled:true})).status,404);
});
test('partial Hub configuration fails explicitly rather than falling back to local files',async t=>{
  const {store}=await setup(t);const api=createApi(store,{env:{ACM_HUB_URL:'https://hub.example.com'}});
  const response=await api(new Request('http://localhost/api/clusters'));assert.equal(response.status,503);
  assert.match((await response.json()).message,/bearer token/);
});
test('the live Hub supplies deployment locations using the same provisioning rules',async t=>{
  const {store}=await setup(t);const resources=seedClusters();resources[0].metadata.labels.location='hub-site';
  resources[1].status.conditions[0].status='False';resources[2].metadata.labels['ai-grid/provisioned']='false';
  const hub=new ACMHubClient({env:{ACM_HUB_URL:'https://hub.example.com',ACM_HUB_TOKEN:'test'},transport:async()=>({status:200,
    body:JSON.stringify({kind:'ManagedClusterList',apiVersion:'cluster.open-cluster-management.io/v1',items:resources})})});
  const response=await createApi(store,{hub})(new Request('http://localhost/api/locations'));assert.equal(response.status,200);
  assert.deepEqual(await response.json(),['hub-site']);
});
test('existing cluster records are retained and deletion is not undone on restart',async t=>{
  const {store}=await setup(t);
  await rm(join(store.directory,'.maas-clusters.json'));await rm(join(store.directory,'clusters/site1.json'));
  const restart=new GitResourceStore({directory:store.directory});await restart.initialize();
  assert.equal((await restart.records('clusters','ManagedCluster')).length,3);
  const again=new GitResourceStore({directory:store.directory});await again.initialize();
  assert.equal((await again.records('clusters','ManagedCluster')).length,3);
});
