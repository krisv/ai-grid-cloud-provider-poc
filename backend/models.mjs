// Standalone Git adapter for the model-serving deployment wizard.
// CR structure follows packages/llmd-serving/src/deployments/deploy.ts and
// packages/maas/frontend/src/odh/modelServingExtensions/modelDeploymentWizard/maasDeploymentTransformer.ts
// at odh-dashboard commit 8051fbbea117457b4da4074fb2856b732e6677a4.
import { ApiError, validate } from './errors.mjs';
import { createModelSchema } from '../shared/model-validation.mjs';
import { dnsName } from '../shared/subscription-validation.mjs';
import { annotations, serialize, revisionOf, modelDomain } from './resources.mjs';
import { modelPlacementResources, placementRecordsFor, modelLocations } from './placements.mjs';
const gateway = {name:'maas-default-gateway',namespace:'openshift-ingress'};
const registrations = (snapshot,record) => snapshot.models.filter(({resource}) =>
  resource.metadata.namespace===record.resource.metadata.namespace &&
  resource.spec.modelRef?.kind==='LLMInferenceService' && resource.spec.modelRef.name===record.resource.metadata.name);
const deploymentFor = (snapshot,model) => model.resource.spec.modelRef?.kind==='LLMInferenceService'
  ? snapshot.deployments.find(record=>record.resource.metadata.namespace===model.resource.metadata.namespace && record.resource.metadata.name===model.resource.spec.modelRef.name)
  : undefined;
export const managedModelDomain = (model,snapshot,deployment=deploymentFor(snapshot,model)) => {
  const cr=deployment?.resource;
  const related=deployment ? registrations(snapshot,deployment) : model ? [model] : [];
  const placementRecords=placementRecordsFor(snapshot,deployment);
  const summary=model ? modelDomain(model.resource,model.revision) : modelDomain({
    metadata:cr.metadata,spec:{modelRef:{kind:'LLMInferenceService',name:cr.metadata.name}},
  });
  return {...summary,
    locations:modelLocations(placementRecords),
    ...(cr ? {modelUri:cr.spec.model?.uri ?? '',modelName:cr.spec.model?.name ?? cr.metadata.name,
      runtimeImage:cr.spec.template?.containers?.find(c=>c.name==='main')?.image ?? '',replicas:cr.spec.replicas ?? 1} : {}),
    hasDeployment:Boolean(cr),availableForSubscriptions:Boolean(model),status:summary.phase==='Saved' ? 'Saved' : cr ? 'Saved' : 'Registered',
    revision:revisionOf(JSON.stringify([deployment?.revision ?? null,...[...related,...placementRecords].map(m=>`${m.path}:${m.revision}`).sort()])),
  };
};
const listModels = snapshot => [
  ...snapshot.models.map(model=>managedModelDomain(model,snapshot)),
  // Keep legacy unpublished deployments manageable, without presenting them as registered models.
  ...snapshot.deployments.filter(record=>registrations(snapshot,record).length===0).map(record=>managedModelDomain(undefined,snapshot,record)),
];
export function deploymentResources(input,namespace) {
  const runtimeArgs=input.runtimeArgs.map(arg=>arg.trim()).filter(arg=>arg && !arg.startsWith('#'));
  const container={name:'main',image:input.runtimeImage,
    resources:{requests:{cpu:input.cpu,memory:input.memory},limits:{cpu:input.cpu,memory:input.memory,
      ...(input.gpuCount ? {'nvidia.com/gpu':String(input.gpuCount)} : {})}},
    ...(runtimeArgs.length ? {env:[{name:'VLLM_ADDITIONAL_ARGS',value:runtimeArgs.join(' ')}]} : {})};
  const metadata={name:input.name,namespace,annotations:annotations(input,{'maas-admin.portal/created-at':new Date().toISOString()})};
  const deployment={apiVersion:'serving.kserve.io/v1alpha2',kind:'LLMInferenceService',metadata,
    spec:{model:{uri:input.modelUri,name:input.modelName},replicas:input.replicas,
      router:{route:{},gateway:{refs:[gateway]}},template:{containers:[container]}}};
  const model={apiVersion:'maas.opendatahub.io/v1alpha1',kind:'MaaSModelRef',metadata:structuredClone(metadata),
    spec:{modelRef:{kind:'LLMInferenceService',name:input.name}}};
  return {deployment,model};
}
export function createModelApi(store,{json,readJson,clusterSource}) {
  return async request => {
    const path=new URL(request.url).pathname;
    if(path==='/api/locations') {
      if(request.method!=='GET')throw new ApiError(405,'validation','This HTTP method is not supported.');
      return json(await clusterSource.locations());
    }
    if(path==='/api/models') {
      if(request.method==='GET') {
        const snapshot=await store.snapshot();return json(listModels({...snapshot,
          models:snapshot.models.filter(r=>r.resource.metadata.namespace===store.namespace),
          deployments:snapshot.deployments.filter(r=>r.resource.metadata.namespace===store.namespace)}));
      }
      if(request.method==='POST') {
        const input=validate(createModelSchema,await readJson(request));
        const availableLocations=clusterSource.mode==='git' ? undefined : await clusterSource.locations();
        const result=await store.transaction(`Create model deployment ${input.name}`,snapshot=>{
          if(input.locations.some(location=>!(availableLocations ?? snapshot.locations).includes(location)))
            throw new ApiError(422,'validation','Select locations with Ready, provisioned AI Grid members.',{locations:'One or more locations no longer have a Ready, provisioned AI Grid member.'});
          if([...snapshot.placements,...snapshot.works].some(r=>r.resource.metadata.namespace===store.namespace && r.resource.metadata.name===input.name))
            throw new ApiError(409,'conflict','Placement resources with this name already exist.');
          if(snapshot.deployments.some(r=>r.resource.metadata.namespace===store.namespace && r.resource.metadata.name===input.name))
            throw new ApiError(409,'conflict','A deployment with this resource name already exists.');
          if(snapshot.models.some(r=>r.resource.metadata.namespace===store.namespace && r.resource.metadata.name===input.name))
            throw new ApiError(409,'conflict','A MaaS model with this resource name already exists.');
          const {deployment,model}=deploymentResources(input,store.namespace);
          const {placement,work}=modelPlacementResources(deployment,input.locations);
          const placementRecord={resource:placement,path:store.resourcePath(placement.kind,store.namespace,input.name),revision:revisionOf(serialize(placement))};
          const workRecord={resource:work,path:store.resourcePath(work.kind,store.namespace,input.name),revision:revisionOf(serialize(work))};
          const record={resource:deployment,revision:revisionOf(serialize(deployment))};
          const modelRecord={resource:model,path:store.resourcePath(model.kind,store.namespace,input.name),revision:revisionOf(serialize(model))};
          const next={...snapshot,models:[...snapshot.models,modelRecord],deployments:[...snapshot.deployments,record],placements:[...snapshot.placements,placementRecord],works:[...snapshot.works,workRecord]};
          return {changes:[{path:store.resourcePath(deployment.kind,store.namespace,input.name),resource:deployment},
            {path:modelRecord.path,resource:model},{path:placementRecord.path,resource:placement},{path:workRecord.path,resource:work}],result:managedModelDomain(modelRecord,next)};
        });
        return json(result,201,{ETag:JSON.stringify(result.revision),Location:`/api/models/${input.name}`});
      }
      throw new ApiError(405,'validation','This HTTP method is not supported.');
    }
    const match=path.match(/^\/api\/models\/([^/]+)$/);
    if(!match)return undefined;
    const namespace=store.namespace;let name;
    try {name=decodeURIComponent(match[1]);}
    catch {throw new ApiError(400,'validation','Invalid deployment identity.');}
    validate(dnsName,name);
    const find=snapshot=>{
      const model=snapshot.models.find(r=>r.resource.metadata.namespace===namespace && r.resource.metadata.name===name);
      const deployment=model ? deploymentFor(snapshot,model) : snapshot.deployments.find(r=>r.resource.metadata.namespace===namespace && r.resource.metadata.name===name);
      if(!model && !deployment)throw new ApiError(404,'not_found','This model could not be found.');
      return {model,deployment};
    };
    if(request.method==='GET') {
      const snapshot=await store.snapshot();const {model,deployment}=find(snapshot);
      const result=managedModelDomain(model,snapshot,deployment);
      return json(result,200,{ETag:JSON.stringify(result.revision)});
    }
    if(request.method==='DELETE') {
      await store.transaction(`Delete model ${namespace}/${name}`,async snapshot=>{
        const {model,deployment}=find(snapshot);const revision=request.headers.get('if-match');
        if(!revision)throw new ApiError(428,'conflict','Reload this model before deleting.');
        if(revision!==JSON.stringify(managedModelDomain(model,snapshot,deployment).revision))throw new ApiError(412,'conflict','This model changed. Reload it before deleting.');
        const models=deployment ? registrations(snapshot,deployment) : [model];
        const subscriptions=await store.records('subscriptions','MaaSSubscription');
        const policies=await store.records('authorization-policies','MaaSAuthPolicy');
        const used=[...subscriptions,...policies].some(({resource})=>(resource.spec.modelRefs ?? []).some(ref=>
          models.some(model=>model.resource.metadata.namespace===ref.namespace && model.resource.metadata.name===ref.name)));
        if(used)throw new ApiError(409,'conflict','Remove this model from its subscriptions and authorization policies before deleting it.');
        return {changes:[...(deployment ? [{path:deployment.path,resource:null}] : []),...[...models,...placementRecordsFor(snapshot,deployment)].map(record=>({path:record.path,resource:null}))],result:undefined};
      });
      return new Response(null,{status:204});
    }
    throw new ApiError(405,'validation','This HTTP method is not supported.');
  };
}
