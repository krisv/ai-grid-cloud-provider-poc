import { ApiError } from './errors.mjs';
import { tenantInputSchema, tenantNameSchema } from '../shared/tenant-validation.mjs';
import { serialize, revisionOf } from './resources.mjs';
const apiVersion = 'osac.portal/v1alpha1';
const tenantDomain = record => ({name: record.resource.metadata.name, ...record.resource.spec,
  status: 'Saved', creationTimestamp: record.resource.metadata.annotations['maas-admin.portal/created-at'],
  updatedAt: record.resource.metadata.annotations['maas-admin.portal/updated-at'], revision: record.revision});
const parse = (schema, value) => {
  const result = schema.safeParse(value);
  if(!result.success)throw new ApiError(422,'validation','The tenant configuration is invalid.',
    Object.fromEntries(result.error.issues.map(issue=>[issue.path.join('.'),issue.message])));
  return result.data;
};
const checkRevision = (request, record) => {
  const revision = request.headers.get('if-match');
  if(!revision)throw new ApiError(428,'conflict','Reload this tenant before saving or deleting.');
  if(revision!==JSON.stringify(record.revision))throw new ApiError(412,'conflict','This tenant changed. Reload it before saving or deleting.');
};
export function createTenantApi(store,{json,readJson}) {
  return async request => {
    const path=new URL(request.url).pathname;
    const match=path.match(/^\/api\/tenants\/([^/]+)$/);
    if(path!=='/api/tenants' && !match)return undefined;
    let name;
    if(match) {
      try {name=decodeURIComponent(match[1]);}catch {throw new ApiError(400,'validation','Invalid tenant name.');}
      name=parse(tenantNameSchema,name);
    }
    const find=snapshot=>{
      const record=snapshot.tenants.find(record=>record.resource.metadata.name===name);
      if(!record)throw new ApiError(404,'not_found','This tenant could not be found.');
      return record;
    };
    if(request.method==='GET') {
      const snapshot=await store.snapshot();
      if(!match)return json(snapshot.tenants.map(tenantDomain));
      const record=find(snapshot);return json(tenantDomain(record),200,{ETag:JSON.stringify(record.revision)});
    }
    if((!match && request.method==='POST') || (match && request.method==='PUT')) {
      const input=parse(tenantInputSchema,await readJson(request));
      if(match && input.name!==name)throw new ApiError(422,'validation','The tenant name cannot be changed.');
      const result=await store.transaction(`${match ? 'Update' : 'Create'} tenant ${input.name}`,snapshot=>{
        const existing=match ? find(snapshot) : undefined;
        if(existing)checkRevision(request,existing);
        if(!match && snapshot.tenants.some(record=>record.resource.metadata.name===input.name))
          throw new ApiError(409,'conflict','A tenant with this name already exists.');
        const otherDomains=snapshot.tenants.filter(record=>record.resource.metadata.name!==input.name)
          .flatMap(record=>record.resource.spec.domains);
        if(input.domains.some(domain=>otherDomains.includes(domain)))
          throw new ApiError(409,'conflict','One or more domains are already assigned to another tenant.');
        const now=new Date().toISOString();
        const resource=existing ? structuredClone(existing.resource) : {apiVersion,kind:'Tenant',
          metadata:{name:input.name,namespace:store.namespace,annotations:{'maas-admin.portal/created-at':now}}};
        resource.metadata.annotations['maas-admin.portal/updated-at']=now;
        resource.spec={domains:input.domains,identityProvider:input.identityProvider};
        const record={resource,revision:revisionOf(serialize(resource))};
        return {changes:[{path:existing?.path ?? store.resourcePath('Tenant',store.namespace,input.name),resource}],result:tenantDomain(record)};
      });
      return json(result,match ? 200 : 201,{ETag:JSON.stringify(result.revision),...(!match ? {Location:`/api/tenants/${input.name}`} : {})});
    }
    if(match && request.method==='DELETE') {
      await store.transaction(`Delete tenant ${name}`,snapshot=>{
        const record=find(snapshot);checkRevision(request,record);
        return {changes:[{path:record.path,resource:null}]};
      });
      return new Response(null,{status:204});
    }
    throw new ApiError(405,'validation','This HTTP method is not supported.');
  };
}
