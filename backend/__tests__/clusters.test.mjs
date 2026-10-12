import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ACMHubClient, clusterDomain } from '../ACMHubClient.mjs';
import { createApi } from '../api.mjs';
const resource=(name,available='True',labels={})=>({apiVersion:'cluster.open-cluster-management.io/v1',kind:'ManagedCluster',
  metadata:{name,labels},status:{conditions:available ? [{type:'ManagedClusterConditionAvailable',status:available}] : []}});
const list=(items,cursor='')=>({apiVersion:'cluster.open-cluster-management.io/v1',kind:'ManagedClusterList',metadata:{continue:cursor},items});
const response=body=>({status:200,body:JSON.stringify(body)});
const env={ACM_HUB_URL:'https://hub.example.com:6443',ACM_HUB_TOKEN:'test-backend-token'};
const apiFor=hub=>createApi({snapshot(){throw new Error('Clusters must not access Git');}},{hub});
const request=(api,path,method='GET',body)=>api(new Request(`http://localhost/api${path}`,{method,
  headers:body ? {'Content-Type':'application/json'} : {},...(body ? {body:JSON.stringify(body)} : {})}));
test('availability and membership follow ACM conditions and the exact true label value',()=>{
  assert.deepEqual(clusterDomain(resource('a','True',{'ai-grid/enabled':'true'})),{name:'a',status:'Ready',aiGridEnabled:true,provisioned:false,provisioningStatus:'Provisioning'});
  assert.deepEqual(clusterDomain(resource('b','False',{'ai-grid/enabled':'false'})),{name:'b',status:'Offline',aiGridEnabled:false,provisioned:false,provisioningStatus:'Not provisioned'});
  for(const condition of ['Unknown',undefined,''])assert.equal(clusterDomain({...resource('c'),status:{conditions:condition ? [{type:'ManagedClusterConditionAvailable',status:condition}] : []}}).status,'Unknown');
  assert.equal(clusterDomain(resource('c','True',{'ai-grid/enabled':'True'})).aiGridEnabled,false);
});
test('lists all Hub pages with server-only credentials and no Git access',async()=>{
  const calls=[];const hub=new ACMHubClient({env,transport:async call=>{
    calls.push(call);
    return response(call.url.searchParams.has('continue') ? list([resource('cluster-c','False')]) :
      list([resource('cluster-b'),resource('cluster-a','True',{'ai-grid/enabled':'true'})],'next/token'));
  }});
  const result=await request(apiFor(hub),'/clusters');assert.equal(result.status,200);
  const body=await result.json();assert.deepEqual(body.map(cluster=>cluster.name),['cluster-a','cluster-b','cluster-c']);
  assert.equal(body[2].status,'Offline');assert.equal(calls.length,2);
  for(const call of calls) {
    assert.equal(call.url.pathname,'/apis/cluster.open-cluster-management.io/v1/managedclusters');
    assert.equal(call.headers.Authorization,'Bearer test-backend-token');assert.equal(call.url.searchParams.get('limit'),'500');
  }
  assert.equal(calls[1].url.searchParams.get('continue'),'next/token');
  assert.ok(!JSON.stringify(body).includes('test-backend-token'));assert.ok(!JSON.stringify(body).includes('metadata'));
});
test('enrollment PATCH changes only the AI Grid label and preserves other Hub labels',async()=>{
  let cluster=resource('cluster-b','False',{location:'site2',team:'platform'});const calls=[];
  const hub=new ACMHubClient({env,transport:async call=>{
    calls.push(call);const patch=JSON.parse(call.body);
    cluster={...cluster,metadata:{...cluster.metadata,labels:{...cluster.metadata.labels,...patch.metadata.labels}}};
    return response(cluster);
  }});
  const api=apiFor(hub);const result=await request(api,'/clusters/cluster-b','PATCH',{aiGridEnabled:true});assert.equal(result.status,200);
  assert.deepEqual(await result.json(),{name:'cluster-b',status:'Offline',aiGridEnabled:true,provisioned:false,provisioningStatus:'Provisioning',location:'site2'});
  assert.equal(calls[0].method,'PATCH');assert.equal(calls[0].url.pathname,'/apis/cluster.open-cluster-management.io/v1/managedclusters/cluster-b');
  assert.equal(calls[0].headers['Content-Type'],'application/merge-patch+json');
  assert.deepEqual(JSON.parse(calls[0].body),{metadata:{labels:{'ai-grid/enabled':'true'}}});
  assert.deepEqual(cluster.metadata.labels,{location:'site2',team:'platform','ai-grid/enabled':'true'});
  assert.equal((await request(api,'/clusters/cluster-b','PATCH',{aiGridEnabled:true})).status,200);
  for(const body of [{aiGridEnabled:false},{aiGridEnabled:true,labels:{location:'other'}},{aiGridEnabled:true,namespace:'other'}])
    assert.equal((await request(api,'/clusters/cluster-b','PATCH',body)).status,422);
  assert.equal((await request(api,'/clusters/%2e%2e%2fescape','PATCH',{aiGridEnabled:true})).status,422);
  assert.equal((await request(api,'/clusters','POST',{aiGridEnabled:true})).status,405);
  assert.equal(calls.length,2);
});
test('missing configuration and upstream failures are safe and never expose credentials or raw Hub messages',async()=>{
  assert.equal((await request(apiFor(new ACMHubClient({env:{}})),'/clusters')).status,503);
  for(const status of [401,403,404,409,422,500]) {
    const hub=new ACMHubClient({env,transport:async()=>({status,body:'sensitive upstream error: test-backend-token'})});
    const result=await request(apiFor(hub),'/clusters/cluster-b','PATCH',{aiGridEnabled:true});
    assert.equal(result.status,status===500 ? 503 : status);assert.ok(!(await result.text()).includes('sensitive'));
  }
  for(const body of ['not JSON',JSON.stringify({items:[]}),JSON.stringify(list([{}]))]) {
    const result=await request(apiFor(new ACMHubClient({env,transport:async()=>({status:200,body})})),'/clusters');
    assert.equal(result.status,503);
  }
  const repeated=new ACMHubClient({env,transport:async()=>response(list([],'same'))});
  assert.equal((await request(apiFor(repeated),'/clusters')).status,503);
  const unconfirmed=new ACMHubClient({env,transport:async()=>response(resource('cluster-b'))});
  assert.equal((await request(apiFor(unconfirmed),'/clusters/cluster-b','PATCH',{aiGridEnabled:true})).status,503);
});
test('token files rotate and CA files are forwarded only to the backend HTTPS transport',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'acm-client-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const tokenFile=join(directory,'token');const caFile=join(directory,'ca.crt');
  await writeFile(tokenFile,'first-token\n');await writeFile(caFile,'test-ca');const calls=[];
  const hub=new ACMHubClient({env:{ACM_HUB_URL:env.ACM_HUB_URL,ACM_HUB_TOKEN_FILE:tokenFile,ACM_HUB_CA_FILE:caFile},
    transport:async call=>{calls.push(call);return response(list([]));}});
  await hub.list();await writeFile(tokenFile,'second-token\n');await hub.list();
  assert.equal(calls[0].headers.Authorization,'Bearer first-token');assert.equal(calls[1].headers.Authorization,'Bearer second-token');
  assert.equal(calls[0].ca.toString(),'test-ca');
  for(const url of ['http://hub.example.com','https://token@hub.example.com','https://hub.example.com/path']) {
    const api=apiFor(new ACMHubClient({env:{...env,ACM_HUB_URL:url},transport:async()=>{throw new Error('Must not be called');}}));
    assert.equal((await request(api,'/clusters')).status,503);
  }
});
