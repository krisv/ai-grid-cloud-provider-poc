import { z } from 'zod';
import { clusterSchema } from './cluster-validation.mjs';
export const metricSchema=z.object({key:z.string(),label:z.string(),unit:z.string(),status:z.enum(['ok','unavailable','not-configured','no-data']),message:z.string().optional(),points:z.array(z.object({timestamp:z.number(),value:z.number().finite()}))});
export const gridOverviewSchema=z.object({updatedAt:z.string(),inventorySource:z.enum(['acm','git','demo']),demo:z.boolean(),metricsSource:z.enum(['thanos','demo']).default('thanos'),clusters:z.array(clusterSchema),metrics:z.array(metricSchema)});
export const metricDefinitions=[
  {key:'requests',label:'Gateway request rate',unit:'req/s',query:'sum(rate(ai_gateway_requests_total{cluster=~__CLUSTERS__}[5m]))'},
  {key:'errors',label:'Gateway error rate',unit:'req/s',query:'sum(rate(ai_gateway_requests_total{cluster=~__CLUSTERS__,status=~"5.."}[5m]))'},
  {key:'latency',label:'Gateway p95 latency',unit:'ms',query:'1000 * histogram_quantile(0.95, sum by (le) (rate(ai_gateway_request_duration_seconds_bucket{cluster=~__CLUSTERS__}[5m])))'},
  {key:'gpu',label:'GPU utilization',unit:'%',query:'avg(DCGM_FI_DEV_GPU_UTIL{cluster=~__CLUSTERS__})'},
];

// Deterministic load simulation shared by browser demos and unconfigured backend Thanos.
// Every metric derives from the same per-cluster traffic; GPU follows recent traffic.
export function demoMetrics(clusters,start,end,step) {
  const active=clusters.filter(c=>c.status==='Ready');
  const hash=name=>[...name].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,7);
  const random=(seed,bucket)=>{
    let n=(seed ^ Math.imul(bucket,0x45d9f3b))>>>0;
    n=Math.imul(n^(n>>>16),0x7feb352d);n=Math.imul(n^(n>>>15),0x846ca68b);
    return ((n^(n>>>16))>>>0)/4294967296;
  };
  const traffic=(timestamp,seed)=>{
    const bucket=Math.floor(timestamp/30);
    const baseline=0.6+(random(seed+3,Math.floor(timestamp/1800))-0.5)*0.4;
    const offset=(random(seed,bucket)-0.5)*0.9;
    const spike=random(seed+2,bucket)>0.91 ? 0.5+random(seed+4,bucket)*1.2 : 0;
    return Math.max(0.04,baseline+offset+spike);
  };
  const series=Array.from({length:Math.floor((end-start)/step)+1},(_,i)=>{
    const timestamp=start+i*step;
    const values=active.map(cluster=>{
      const seed=hash(cluster.name),capacity=90+seed%120;
      const load=traffic(timestamp,seed),recent=load*0.8+traffic(timestamp-30,seed)*0.15+traffic(timestamp-60,seed)*0.05;
      const requests=capacity*load;
      const gpu=Math.min(98,8+recent*66+(random(seed+1,Math.floor(timestamp/30))-0.5)*4);
      const pressure=Math.max(0,recent-0.85);
      return {requests,gpu,errors:requests*(0.001+pressure*0.018+random(seed+2,Math.floor(timestamp/30))*0.0015),latency:65+recent*95+pressure*220};
    });
    const requests=values.reduce((sum,v)=>sum+v.requests,0);
    return {timestamp,requests,errors:values.reduce((sum,v)=>sum+v.errors,0),
      gpu:values.reduce((sum,v)=>sum+v.gpu,0)/Math.max(1,values.length),
      latency:values.reduce((sum,v)=>sum+v.latency*v.requests,0)/Math.max(1,requests)};
  });
  return metricDefinitions.map(({query,...definition})=>({...definition,status:active.length ? 'ok' : 'no-data',
    ...(!active.length ? {message:clusters.length ? 'No available clusters report simulated telemetry for this selection.' : 'No enrolled clusters match this selection.'} : {}),
    points:active.length ? series.map(row=>({timestamp:row.timestamp,value:Number(row[definition.key].toFixed(3))})) : []}));
}
