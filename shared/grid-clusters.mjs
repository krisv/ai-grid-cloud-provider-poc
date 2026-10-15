import { locationSchema } from './model-validation.mjs';
export function clusterDomain(resource) {
  const available=resource.status?.conditions?.find(condition=>condition.type==='ManagedClusterConditionAvailable')?.status;
  const labels=resource.metadata.labels ?? {};
  const annotations=resource.metadata.annotations ?? {};
  const coordinate=(key,min,max)=>{const raw=annotations[key];const value=Number(raw);return typeof raw==='string' && raw.trim() && Number.isFinite(value) && value>=min && value<=max ? value : undefined;};
  const latitude=coordinate('ai-grid/latitude',-90,90),longitude=coordinate('ai-grid/longitude',-180,180);
  const aiGridEnabled=labels['ai-grid/enabled']==='true';
  const provisioned=labels['ai-grid/provisioned']==='true';
  return {name:resource.metadata.name,status:available==='True' ? 'Ready' : available==='False' ? 'Offline' : 'Unknown',
    aiGridEnabled,provisioned,provisioningStatus:provisioned ? 'Provisioned' : aiGridEnabled ? 'Provisioning' : 'Not provisioned',
    ...(labels.location ? {location:labels.location} : {}),
    ...(labels['ai-grid/site'] ? {site:labels['ai-grid/site']} : {}),
    ...(labels['ai-grid/region'] ? {region:labels['ai-grid/region']} : {}),
    ...(annotations['ai-grid/site-name'] ? {siteName:annotations['ai-grid/site-name']} : {}),
    ...(latitude!==undefined && longitude!==undefined ? {latitude,longitude} : {})};
}
export function eligibleLocations(clusters) {
  return [...new Set(clusters.filter(cluster=>cluster.aiGridEnabled && cluster.provisioned && cluster.status==='Ready' &&
    locationSchema.safeParse(cluster.location).success).map(cluster=>cluster.location))].sort();
}
export function seedClusters() {
  const sites=[['san-francisco','San Francisco','us-west','37.7749','-122.4194'],['new-york','New York','us-east','40.7128','-74.0060'],['brussels','Brussels','europe-west','50.8503','4.3517'],['sydney','Sydney','asia-pacific','-33.8688','151.2093']];
  return ['site1','site2','site3','site4'].map((name,index)=>({apiVersion:'cluster.open-cluster-management.io/v1',kind:'ManagedCluster',
    metadata:{name,labels:{location:name,'ai-grid/provisioned':index<3 ? 'true' : 'false','ai-grid/site':sites[index][0],'ai-grid/region':sites[index][2],...(index<3 ? {'ai-grid/enabled':'true'} : {})},
      annotations:{'ai-grid/site-name':sites[index][1],'ai-grid/latitude':sites[index][3],'ai-grid/longitude':sites[index][4]}},
    spec:{hubAcceptsClient:true},status:{conditions:[{type:'ManagedClusterConditionAvailable',status:'True',reason:'ManagedClusterAvailable',
      message:'The managed cluster is available.'}]}}));
}
