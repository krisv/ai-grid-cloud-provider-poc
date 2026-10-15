import type { GridOverview } from '~/services/subscriptions/SubscriptionService';
import type { Tenant } from '~/app/types/tenants';
import type { ManagedModel } from '~/app/types/models';
type Metric=GridOverview['metrics'][number];
const seed=(name:string)=>[...name].reduce((n,c)=>Math.imul(n,31)+c.charCodeAt(0),7)>>>0;
export const noise=(name:string,timestamp:number)=>{let n=(seed(name)^Math.imul(Math.floor(timestamp/30),0x45d9f3b))>>>0;n=Math.imul(n^(n>>>16),0x7feb352d);return ((n^(n>>>15))>>>0)/4294967296;};
export function total(metric?:Metric) {
  const points=metric?.status==='ok' ? metric.points : [];
  return points.length ? points.slice(1).reduce((sum,p,i)=>sum+(p.value+points[i].value)/2*(p.timestamp-points[i].timestamp),0) : undefined;
}
export function modelMetrics(models:ManagedModel[],metrics:Metric[],simulated:boolean,allModels:ManagedModel[]=models):Metric[] {
  const requests=metrics.find(m=>m.key==='requests'),latency=metrics.find(m=>m.key==='latency');
  const definitions=[['queue','Request queue length','requests'],['replicas','Replica count','replicas'],['p90','P90 E2E request latency','ms'],['ttft','P90 Time to first token (TTFT)','ms'],['tokens','Token throughput','tokens/s'],['cache','KV cache utilization','%']];
  const profile=models.reduce((sum,m)=>sum+seed(m.name)%97,0)/Math.max(1,models.length);
  return definitions.map(([key,label,unit])=>({key,label,unit,status:simulated && requests?.status==='ok' && models.length ? 'ok' : 'no-data',
    message:simulated ? 'No model telemetry for this selection.' : 'Per-model Thanos telemetry is not configured.',
    points:!simulated || !models.length ? [] : (requests?.points ?? []).map((p,i)=>{
      const jitter=noise(models.map(m=>m.name).join(',')+key,p.timestamp),load=p.value;
      const value=key==='queue' ? Math.max(0,Math.round(load*0.07+jitter*6-2)) : key==='replicas' ? models.reduce((n,m)=>n+(m.replicas ?? 1),0) : key==='p90' ? (latency?.points[i]?.value ?? 180)*(0.8+profile/300)+(jitter-0.5)*25 : key==='ttft' ? 30+load*0.35+profile*0.3+(jitter-0.5)*15 : key==='tokens' ? load*(14+profile/10)*(0.8+jitter*0.4) : Math.min(98,15+load*0.18+profile*0.2+(jitter-0.5)*12);
      return {timestamp:p.timestamp,value:Number(value.toFixed(2))};
    })}));
}
// Tenant identities always come from the tenant service; only measurements are simulated.
export function tenantUsage(metrics:Metric[],tenants:Pick<Tenant,'name'>[]) {
  const requests=metrics.find(m=>m.key==='requests');
  const samples=requests?.status==='ok' ? requests.points : [];
  const rates=tenants.map(tenant=>samples.map(p=>{
    const weights=tenants.map(t=>0.3+noise(t.name+'-traffic',Math.floor(p.timestamp/900)*900)*1.8);
    const weight=weights[tenants.indexOf(tenant)]/Math.max(0.001,weights.reduce((a,b)=>a+b,0));
    const inputPerRequest=150+seed(tenant.name)%350+noise(tenant.name+'-prompt',p.timestamp)*220;
    const outputPerRequest=60+seed(tenant.name+'-output')%180+noise(tenant.name+'-generation',p.timestamp)*120;
    const cacheFraction=0.05+noise(tenant.name+'-cache',Math.floor(p.timestamp/300)*300)*0.65;
    const prompt=p.value*weight*inputPerRequest;
    return {timestamp:p.timestamp,input:prompt*(1-cacheFraction),cached:prompt*cacheFraction,output:p.value*weight*outputPerRequest};
  }));
  return tenants.map((tenant,index)=>{
    const integrate=(key:'input'|'output'|'cached')=>Math.round(rates[index].slice(1).reduce((sum,p,i)=>sum+(p[key]+rates[index][i][key])/2*(p.timestamp-rates[index][i].timestamp),0));
    return {id:tenant.name,name:tenant.name,input:integrate('input'),output:integrate('output'),cached:integrate('cached')};
  });
}
