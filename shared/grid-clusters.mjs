import { locationSchema } from './model-validation.mjs';
export function clusterDomain(resource) {
  const available=resource.status?.conditions?.find(condition=>condition.type==='ManagedClusterConditionAvailable')?.status;
  const labels=resource.metadata.labels ?? {};
  const aiGridEnabled=labels['ai-grid/enabled']==='true';
  const provisioned=labels['ai-grid/provisioned']==='true';
  return {name:resource.metadata.name,status:available==='True' ? 'Ready' : available==='False' ? 'Offline' : 'Unknown',
    aiGridEnabled,provisioned,provisioningStatus:provisioned ? 'Provisioned' : aiGridEnabled ? 'Provisioning' : 'Not provisioned',
    ...(labels.location ? {location:labels.location} : {})};
}
export function eligibleLocations(clusters) {
  return [...new Set(clusters.filter(cluster=>cluster.aiGridEnabled && cluster.provisioned && cluster.status==='Ready' &&
    locationSchema.safeParse(cluster.location).success).map(cluster=>cluster.location))].sort();
}
export function seedClusters() {
  return ['site1','site2','site3','site4'].map((name,index)=>({apiVersion:'cluster.open-cluster-management.io/v1',kind:'ManagedCluster',
    metadata:{name,labels:{location:name,'ai-grid/provisioned':index<3 ? 'true' : 'false',...(index<3 ? {'ai-grid/enabled':'true'} : {})}},
    spec:{hubAcceptsClient:true},status:{conditions:[{type:'ManagedClusterConditionAvailable',status:'True',reason:'ManagedClusterAvailable',
      message:'The managed cluster is available.'}]}}));
}
