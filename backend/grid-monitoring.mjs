import { readFile } from 'node:fs/promises';
import { ApiError } from './errors.mjs';
import { metricDefinitions, demoMetrics } from '../shared/grid-monitoring.mjs';
export function createGridApi(clusterSource,{json,env=process.env,transport=fetch,now=()=>Date.now()}={}) {
  return async request=>{
    const url=new URL(request.url);
    if(url.pathname!=='/api/grid/overview')return;
    if(request.method!=='GET')throw new ApiError(405,'validation','This HTTP method is not supported.');
    const range=url.searchParams.get('range') ?? '1h';
    const seconds={'1h':3600,'6h':21600,'24h':86400}[range];
    if(!seconds)throw new ApiError(422,'validation','Choose a time range of 1h, 6h, or 24h.');
    const all=(await clusterSource.list()).filter(cluster=>cluster.aiGridEnabled);
    const site=url.searchParams.get('site');
    const clusters=site ? all.filter(cluster=>cluster.site===site) : all;
    const end=Math.floor(now()/1000),start=end-seconds,step=Math.ceil(seconds/60);
    const pattern=clusters.map(c=>c.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
    const simulated=!env.THANOS_QUERY_URL;
    const metrics=url.searchParams.get('metrics')==='false' ? [] : simulated ? demoMetrics(clusters,start,end,step) : await Promise.all(metricDefinitions.map(async ({query,...definition})=>{
      const result={...definition,points:[]};
      if(!env.THANOS_QUERY_URL)return {...result,status:'not-configured',message:'Thanos is not configured.'};
      if(!clusters.length)return {...result,status:'no-data',message:'No enrolled clusters match this selection.'};
      try {
        const origin=new URL(env.THANOS_QUERY_URL);
        if(!['https:','http:'].includes(origin.protocol) || origin.username || origin.password || origin.search || origin.hash)throw new Error('Invalid configuration');
        const token=env.THANOS_TOKEN_FILE ? (await readFile(env.THANOS_TOKEN_FILE,'utf8')).trim() : undefined;
        const expression=(env[`THANOS_${definition.key.toUpperCase()}_QUERY`] ?? query).replaceAll('__CLUSTERS__',JSON.stringify(pattern));
        const target=new URL(`${origin.href.replace(/\/$/,'')}/api/v1/query_range`);
        target.search=new URLSearchParams({query:expression,start:String(start),end:String(end),step:String(step),partial_response:'false'}).toString();
        const response=await transport(target,{headers:{Accept:'application/json',...(token ? {Authorization:`Bearer ${token}`} : {})},redirect:'error',signal:AbortSignal.timeout(10000)});
        if(!response.ok)throw new Error('Query failed');
        const body=await response.json();
        if(body.status!=='success' || body.data?.resultType!=='matrix' || !Array.isArray(body.data.result) || body.warnings?.length)throw new Error('Invalid or partial query result');
        if(body.data.result.length>1)throw new Error('Query must aggregate into one series');
        const values=body.data.result[0]?.values ?? [];
        if(!Array.isArray(values))throw new Error('Invalid values');
        const points=values.filter(v=>Array.isArray(v) && v.length===2 && typeof v[0]==='number' && Number.isFinite(v[0]) && typeof v[1]==='string' && v[1].trim() && Number.isFinite(Number(v[1])))
          .map(([timestamp,value])=>({timestamp,value:Number(value)}));
        return {...result,status:points.length ? 'ok' : 'no-data',points,...(!points.length ? {message:'No samples available for this selection.'} : {})};
      } catch {return {...result,status:'unavailable',message:'This metric could not be queried. Check backend Thanos configuration and connectivity.'};}
    }));
    return json({updatedAt:new Date(end*1000).toISOString(),inventorySource:clusterSource.mode==='acm' ? 'acm' : 'git',demo:false,metricsSource:simulated ? 'demo' : 'thanos',clusters,metrics});
  };
}
