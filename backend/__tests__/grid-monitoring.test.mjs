import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGridApi } from '../grid-monitoring.mjs';
import { clusterDomain } from '../../shared/grid-clusters.mjs';
import { gridOverviewSchema, demoMetrics } from '../../shared/grid-monitoring.mjs';
const cluster=(name,site,enabled=true)=>({name,site,aiGridEnabled:enabled,status:'Ready',provisioned:true,provisioningStatus:'Provisioned'});
const source={mode:'acm',list:async()=>[cluster('a.example','brussels'),cluster('b','virginia'),cluster('c','brussels',false)]};
const json=body=>Response.json(body);
const request=(range='1h',site='')=>new Request(`http://localhost/api/grid/overview?range=${range}&site=${site}`);
test('site metadata preserves zero and negative coordinates and rejects invalid coordinates',()=>{
 const resource={metadata:{name:'a',labels:{'ai-grid/site':'london'},annotations:{'ai-grid/latitude':'0','ai-grid/longitude':'-0.12'}}};
 const value=clusterDomain(resource);assert.equal(value.site,'london');assert.equal(value.latitude,0);assert.equal(value.longitude,-0.12);
 for(const latitude of ['', '91', 'NaN'])assert.equal(clusterDomain({...resource,metadata:{...resource.metadata,annotations:{'ai-grid/latitude':latitude,'ai-grid/longitude':'0'}}}).latitude,undefined);
});
test('no Thanos configuration preserves ACM inventory and explicitly identifies simulated metrics',async()=>{
 const api=createGridApi(source,{json,env:{}});const data=await (await api(request())).json();
 assert.equal(gridOverviewSchema.safeParse(data).success,true);assert.deepEqual(data.clusters.map(c=>c.name),['a.example','b']);
 assert.equal(data.demo,false);assert.equal(data.inventorySource,'acm');assert.equal(data.metricsSource,'demo');
 assert.ok(data.metrics.every(m=>m.status==='ok' && m.points.length===61));
 const selected=await (await api(request('1h','brussels'))).json();assert.notEqual(selected.metrics[0].points[0].value,data.metrics[0].points[0].value);
 const empty=await (await api(request('1h','missing'))).json();assert.ok(empty.metrics.every(m=>m.status==='no-data' && m.points.length===0));
});
test('queries selected cluster names, respects time range, and handles failed metrics independently',async()=>{
 const calls=[];const api=createGridApi(source,{json,env:{THANOS_QUERY_URL:'https://thanos.example'},now:()=>100000000,transport:async(url,options)=>{
  calls.push({url,options});
  if(url.searchParams.get('query').includes('histogram_quantile'))return new Response('',{status:503});
  return Response.json({status:'success',data:{resultType:'matrix',result:[{values:[[99900,'12'],[99960,'NaN']]}]}});
 }});
 const data=await (await api(request('6h','brussels'))).json();assert.equal(data.clusters.length,1);assert.equal(calls.length,4);
 for(const {url,options} of calls){assert.equal(url.pathname,'/api/v1/query_range');assert.equal(url.searchParams.get('start'),'78400');assert.equal(url.searchParams.get('step'),'360');assert.ok(url.searchParams.get('query').includes(JSON.stringify('a\\.example')));assert.equal(options.redirect,'error');}
 assert.equal(data.metrics.find(m=>m.key==='latency').status,'unavailable');assert.equal(data.metrics[0].points.length,1);
});
test('empty selection never queries all clusters and partial responses are not displayed as healthy',async()=>{
 let calls=0;const api=createGridApi(source,{json,env:{THANOS_QUERY_URL:'https://thanos.example'},transport:async()=>{calls++;return Response.json({status:'success',warnings:['partial'],data:{resultType:'matrix',result:[]}});}});
 const empty=await (await api(request('1h','missing'))).json();assert.equal(calls,0);assert.ok(empty.metrics.every(m=>m.status==='no-data'));
 const partial=await (await api(request())).json();assert.ok(partial.metrics.every(m=>m.status==='unavailable'));
 await assert.rejects(()=>api(request('unbounded')),/Choose a time range/);
});
test('AI Grid inventory-only requests do not query Thanos',async()=>{
 const api=createGridApi(source,{json,env:{THANOS_QUERY_URL:'https://thanos.example'},transport:async()=>{throw new Error('Inventory must not query metrics');}});
 const response=await api(new Request('http://localhost/api/grid/overview?metrics=false'));
 const data=await response.json();assert.equal(data.clusters.length,2);assert.deepEqual(data.metrics,[]);
});

test('demo traffic fluctuates, drives correlated GPU load, and aggregates selected sites consistently',()=>{
 const clusters=[cluster('site1','west'),cluster('site2','east')];
 const first=demoMetrics([clusters[0]],96400,100000,60),second=demoMetrics([clusters[1]],96400,100000,60),fleet=demoMetrics(clusters,96400,100000,60);
 assert.deepEqual(first,demoMetrics([clusters[0]],96400,100000,60));
 const requests=first[0].points.map(p=>p.value),gpu=first[3].points.map(p=>p.value);
 assert.ok(Math.max(...requests)>Math.min(...requests)*3);assert.ok(gpu.every(v=>v>=0 && v<=100));
 const mean=a=>a.reduce((sum,v)=>sum+v,0)/a.length;const x=mean(requests),y=mean(gpu);
 const covariance=requests.reduce((sum,v,i)=>sum+(v-x)*(gpu[i]-y),0);
 const correlation=covariance/Math.sqrt(requests.reduce((sum,v)=>sum+(v-x)**2,0)*gpu.reduce((sum,v)=>sum+(v-y)**2,0));
 assert.ok(correlation>0.8,`Request/GPU correlation was ${correlation}`);
 for(let i=0;i<requests.length;i++){assert.ok(Math.abs(fleet[0].points[i].value-first[0].points[i].value-second[0].points[i].value)<0.002);assert.ok(first[1].points[i].value<=requests[i]);}
 const overlap=demoMetrics([clusters[0]],92800,100000,60);assert.deepEqual(overlap[0].points.slice(-61),first[0].points);
});
