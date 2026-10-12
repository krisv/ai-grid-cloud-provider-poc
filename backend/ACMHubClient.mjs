import { request as httpsRequest } from 'node:https';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { ApiError } from './errors.mjs';
import { managedClusterSchema } from '../shared/cluster-validation.mjs';
import { clusterDomain, eligibleLocations } from '../shared/grid-clusters.mjs';
export { clusterDomain } from '../shared/grid-clusters.mjs';
const collection='/apis/cluster.open-cluster-management.io/v1/managedclusters';
const serviceAccount='/var/run/secrets/kubernetes.io/serviceaccount';
const listSchema=z.object({kind:z.literal('ManagedClusterList'),apiVersion:z.literal('cluster.open-cluster-management.io/v1'),
  metadata:z.object({continue:z.string().optional()}).passthrough().optional(),items:z.array(managedClusterSchema)}).passthrough();
export const hasHubConfiguration=(env=process.env)=>Boolean(env.ACM_HUB_URL || env.ACM_HUB_TOKEN_FILE || env.ACM_HUB_TOKEN || env.ACM_HUB_CA_FILE || env.KUBERNETES_SERVICE_HOST);
// HTTPS with normal certificate verification and optional Hub CA, without global TLS overrides.
export function requestHub({url,method,headers,body,ca}) {
  return new Promise((resolve,reject)=>{
    const signal=AbortSignal.timeout(10000);
    const request=httpsRequest(url,{method,headers,ca,signal},response=>{
      let size=0;const chunks=[];
      response.on('data',chunk=>{
        size+=chunk.length;
        if(size>16*1024*1024) {request.destroy(new Error('ACM response too large'));return;}
        chunks.push(chunk);
      });
      response.on('error',reject);
      response.on('end',()=>resolve({status:response.statusCode ?? 503,body:Buffer.concat(chunks).toString('utf8')}));
    });
    request.on('error',()=>reject(new ApiError(503,'unavailable',signal.aborted ? 'The ACM Hub request timed out. Try again.' :
      'The ACM Hub could not be reached. Check its URL, connectivity, and CA certificate.')));
    request.end(body);
  });
}
export class ACMHubClient {
  mode='acm';
  constructor({env=process.env,transport=requestHub}={}) {this.env=env;this.transport=transport;}
  async configuration() {
    const inCluster=!this.env.ACM_HUB_URL && Boolean(this.env.KUBERNETES_SERVICE_HOST);
    const host=this.env.KUBERNETES_SERVICE_HOST;
    const url=this.env.ACM_HUB_URL ?? (inCluster ? `https://${host.includes(':') ? `[${host}]` : host}:${this.env.KUBERNETES_SERVICE_PORT_HTTPS ?? '443'}` : undefined);
    if(!url)throw new ApiError(503,'unavailable','The ACM Hub is not configured. Set ACM_HUB_URL and ACM_HUB_TOKEN_FILE on the backend.');
    let origin;
    try {
      origin=new URL(url);
      if(origin.protocol!=='https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname!=='/')throw new Error('Invalid Hub URL');
    } catch {throw new ApiError(503,'unavailable','ACM_HUB_URL must be the HTTPS origin of the ACM Hub Kubernetes API.');}
    const tokenFile=this.env.ACM_HUB_TOKEN_FILE ?? (inCluster ? `${serviceAccount}/token` : undefined);
    const caFile=this.env.ACM_HUB_CA_FILE ?? (inCluster ? `${serviceAccount}/ca.crt` : undefined);
    let token,ca;
    try {
      token=(tokenFile ? await readFile(tokenFile,'utf8') : this.env.ACM_HUB_TOKEN)?.trim();
      if(caFile)ca=await readFile(caFile);
    } catch {throw new ApiError(503,'unavailable','The ACM Hub token or CA file could not be read. Check backend configuration.');}
    if(!token || /\s/.test(token))throw new ApiError(503,'unavailable','Configure a valid ACM Hub bearer token using ACM_HUB_TOKEN_FILE or ACM_HUB_TOKEN.');
    return {origin,token,ca};
  }
  async call(path,method='GET',body) {
    const {origin,token,ca}=await this.configuration();
    let response;
    try {
      response=await this.transport({url:new URL(path,origin),method,ca,
        headers:{Accept:'application/json',Authorization:`Bearer ${token}`,
          ...(body ? {'Content-Type':'application/merge-patch+json'} : {})},body:body ? JSON.stringify(body) : undefined});
    } catch(error) {
      if(error instanceof ApiError)throw error;
      throw new ApiError(503,'unavailable','The ACM Hub could not be reached. Try again.');
    }
    const errors={401:[401,'unauthorized','The ACM Hub rejected the backend credentials. Check the Hub token.'],
      403:[403,'forbidden','The backend does not have permission to list or patch ACM ManagedClusters.'],
      404:[404,'not_found',method==='PATCH' ? 'This ManagedCluster could not be found on the ACM Hub.' : 'The ManagedCluster API could not be found on the ACM Hub.'],
      409:[409,'conflict','The ManagedCluster changed. Refresh the cluster list and try again.'],
      422:[422,'validation','The ACM Hub rejected the AI Grid label update.']};
    if(response.status<200 || response.status>=300) {
      const [status,code,message]=errors[response.status] ?? [503,'unavailable','The ACM Hub request failed. Try again.'];
      throw new ApiError(status,code,message);
    }
    try {return JSON.parse(response.body);}catch {throw new ApiError(503,'unavailable','The ACM Hub returned invalid JSON.');}
  }
  async list() {
    const clusters=[];const seen=new Set();let cursor='';
    do {
      const query=new URLSearchParams({limit:'500',...(cursor ? {continue:cursor} : {})});
      const parsed=listSchema.safeParse(await this.call(`${collection}?${query}`));
      if(!parsed.success)throw new ApiError(503,'unavailable','The ACM Hub returned an invalid ManagedCluster list.');
      clusters.push(...parsed.data.items.map(clusterDomain));
      cursor=parsed.data.metadata?.continue ?? '';
      if(cursor && seen.has(cursor))throw new ApiError(503,'unavailable','The ACM Hub returned a repeated pagination token. Refresh and try again.');
      if(cursor)seen.add(cursor);
    } while(cursor);
    return clusters.sort((a,b)=>a.name.localeCompare(b.name));
  }
  async enroll(name) {
    const parsed=managedClusterSchema.safeParse(await this.call(`${collection}/${encodeURIComponent(name)}`,'PATCH',
      {metadata:{labels:{'ai-grid/enabled':'true'}}}));
    if(!parsed.success || parsed.data.metadata.name!==name)throw new ApiError(503,'unavailable','The ACM Hub returned an invalid ManagedCluster after the update.');
    const cluster=clusterDomain(parsed.data);
    if(!cluster.aiGridEnabled)throw new ApiError(503,'unavailable','The ACM Hub did not confirm the AI Grid label. Refresh the cluster list before retrying.');
    return cluster;
  }
  async locations() {return eligibleLocations(await this.list());}
}
