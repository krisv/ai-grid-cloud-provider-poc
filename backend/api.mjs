import { ApiError, validate } from './errors.mjs';
import { serveApiDocs } from './api-docs.mjs';
import { createModelApi } from './models.mjs';
import { createTenantApi } from './tenants.mjs';
import { createGridApi } from './grid-monitoring.mjs';
import { createClusterApi } from './clusters.mjs';
import { ACMHubClient, hasHubConfiguration } from './ACMHubClient.mjs';
import { GitClusterClient } from './GitClusterClient.mjs';
import { withoutNamespace, hasNamespace } from '../shared/public-data.mjs';
import { createSchema, updateSchema, dnsName } from '../shared/subscription-validation.mjs';
import { modelDomain, policyDomain, subscriptionDomain, subscriptionResource, policyResource, isSubscriptionPolicy, serialize, revisionOf } from './resources.mjs';
const modelKey=ref=>`${ref.namespace}/${ref.name}`;
const modelsOf=(snapshot,namespace)=>snapshot.models.filter(record=>record.resource.metadata.namespace===namespace).map(record=>modelDomain(record.resource,record.revision));
const find=(snapshot,name)=>{
  const record=snapshot.subscriptions.find(record=>record.resource.metadata.name===name);
  if(!record)throw new ApiError(404,'not_found','This subscription could not be found.');
  return record;
};
const checkRevision=(request,record)=>{
  const expected=request.headers.get('if-match');
  if(!expected)throw new ApiError(428,'conflict','Reload this subscription before saving or deleting.');
  if(expected!==JSON.stringify(record.revision))throw new ApiError(412,'conflict','This subscription changed. Reload it before saving or deleting.');
};
const json=(value,status=200,headers={})=>new Response(JSON.stringify(withoutNamespace(value)),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
async function readJson(request) {
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new ApiError(415,'validation','Use application/json for requests.');
  const body=await request.text();
  if(Buffer.byteLength(body)>1_048_576)throw new ApiError(413,'validation','The request body is too large.');
  let value;
  try {value=JSON.parse(body);}catch {throw new ApiError(400,'validation','The request body must be valid JSON.');}
  if(hasNamespace(value))throw new ApiError(422,'validation','Namespace is configured by the backend and must not be included in requests.');
  return value;
}
/** @param {any} store @param {{hub?: ACMHubClient | GitClusterClient, env?: Record<string,string|undefined>}} [options] */
export function createApi(store,{hub,env=process.env}={}) {
  const clusterSource=hub ?? (hasHubConfiguration(env) ? new ACMHubClient({env}) : new GitClusterClient(store));
  const gridApi=createGridApi(clusterSource,{json,env});
  const clusterApi=createClusterApi(clusterSource,{json,readJson});
  const modelApi=createModelApi(store,{json,readJson,clusterSource});
  const tenantApi=createTenantApi(store,{json,readJson});
  return async request=>{
    try {
      const url=new URL(request.url);const path=url.pathname;
      const docs=await serveApiDocs(request);
      if(docs)return docs;
      const gridResponse=await gridApi(request);
      if(gridResponse)return gridResponse;
      const clusterResponse=await clusterApi(request);
      if(clusterResponse)return clusterResponse;
      const tenantResponse=await tenantApi(request);
      if(tenantResponse)return tenantResponse;
      const modelResponse=await modelApi(request);
      if(modelResponse)return modelResponse;
      if(path==='/api/health' && request.method==='GET') {
        await store.snapshot();return json({status:'ok',storage:'git',autoCommit:store.autoCommit});
      }
      if(request.method==='GET' && path==='/api/subscriptions') {
        const snapshot=await store.snapshot();const models=modelsOf(snapshot,store.namespace);
        return json(snapshot.subscriptions.map(record=>subscriptionDomain(record.resource,record.revision,models)));
      }
      if(path==='/api/subscriptions' && request.method==='POST') {
        const input=validate(createSchema,await readJson(request));
        if(input.createAuthPolicy && input.name.length>246)throw new ApiError(422,'validation','The resource name must be at most 246 characters when creating a matching authorization policy.',{name:'Leave room for the -policy suffix.'});
        const result=await store.transaction(`Create subscription ${input.name}`,snapshot=>{
          if(snapshot.subscriptions.some(r=>r.resource.metadata.name===input.name))throw new ApiError(409,'conflict','A subscription with this resource name already exists.');
          const previousPolicy=input.createAuthPolicy ? snapshot.policies.find(r=>r.resource.metadata.name===`${input.name}-policy`) : undefined;
          if(previousPolicy && !isSubscriptionPolicy(previousPolicy.resource,input.name))throw new ApiError(409,'conflict','An independently managed authorization policy already uses this name. Choose another subscription name.');
          const cr=subscriptionResource(input,store.namespace);const policy=input.createAuthPolicy ? policyResource(input,store.namespace) : undefined;
          return {changes:[{path:store.resourcePath(cr.kind,store.namespace,input.name),resource:cr},...(policy ? [{path:previousPolicy?.path ?? store.resourcePath(policy.kind,store.namespace,policy.metadata.name),resource:policy}] : [])],
            result:{subscription:subscriptionDomain(cr,revisionOf(serialize(cr)),modelsOf(snapshot,store.namespace)),...(policy ? {authPolicy:policyDomain(policy)} : {})}};
        });
        return json(result,201,{'ETag':JSON.stringify(result.subscription.revision),'Location':`/api/subscriptions/${encodeURIComponent(input.name)}`});
      }
      const match=path.match(/^\/api\/subscriptions\/([^/]+)$/);
      if(match) {
        let name;
        try {name=decodeURIComponent(match[1]);}catch {throw new ApiError(400,'validation','Invalid subscription name.');}
        validate(dnsName,name);
        if(request.method==='GET') {
          const snapshot=await store.snapshot();const record=find(snapshot,name);const models=modelsOf(snapshot,store.namespace);
          const refs=record.resource.spec.modelRefs ?? [];
          return json({subscription:subscriptionDomain(record.resource,record.revision,models),modelRefs:models.filter(m=>refs.some(r=>r.name===m.name && r.namespace===store.namespace)),
            authPolicies:snapshot.policies.filter(p=>(p.resource.spec.modelRefs ?? []).some(m=>refs.some(r=>r.name===m.name && r.namespace===store.namespace))).map(p=>policyDomain(p.resource)),
            ...(record.resource.spec.tokenMetadata ? {meteringMetadata:record.resource.spec.tokenMetadata} : {})},200,{'ETag':JSON.stringify(record.revision)});
        }
        if(request.method==='PUT') {
          const input=validate(updateSchema,await readJson(request));
          const result=await store.transaction(`Update subscription ${name}`,snapshot=>{
            const record=find(snapshot,name);checkRevision(request,record);
            const cr=subscriptionResource({...input,description:input.description ?? ''},store.namespace,record.resource);
            return {changes:[{path:record.path,resource:cr}],result:{subscription:subscriptionDomain(cr,revisionOf(serialize(cr)),modelsOf(snapshot,store.namespace))}};
          });
          return json(result,200,{'ETag':JSON.stringify(result.subscription.revision)});
        }
        if(request.method==='DELETE') {
          await store.transaction(`Delete subscription ${name}`,snapshot=>{
            const record=find(snapshot,name);checkRevision(request,record);
            const policies=snapshot.policies.filter(policy=>isSubscriptionPolicy(policy.resource,name));
            return {changes:[record,...policies].map(record=>({path:record.path,resource:null})),result:undefined};
          });
          return new Response(null,{status:204});
        }
        throw new ApiError(405,'validation','This HTTP method is not supported.');
      }
      throw new ApiError(404,'not_found','This API route could not be found.');
    } catch(error) {
      if(error instanceof ApiError)return json({code:error.code,message:error.message,...(error.fieldErrors ? {fieldErrors:error.fieldErrors} : {})},error.status);
      console.error('Subscription API failed:',error);return json({code:'unavailable',message:'The resource repository is unavailable. Check the backend logs.'},503);
    }
  };
}
