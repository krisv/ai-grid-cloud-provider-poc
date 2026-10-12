// ACM-style selection and workload distribution, saved to Git only.
export const modelPlacementResources = (deployment, locations) => {
  const metadata = {name: deployment.metadata.name, namespace: deployment.metadata.namespace,
    labels: {'maas-admin.portal/model': deployment.metadata.name}};
  const placement = {apiVersion: 'cluster.open-cluster-management.io/v1beta1', kind: 'Placement',
    metadata, spec: {predicates: [{requiredClusterSelector: {labelSelector: {matchLabels:{'ai-grid/enabled':'true','ai-grid/provisioned':'true'},matchExpressions: [
      {key: 'location', operator: 'In', values: [...locations]},
    ]}}}]}};
  const work = {apiVersion: 'work.open-cluster-management.io/v1alpha1', kind: 'ManifestWorkReplicaSet',
    metadata: structuredClone(metadata), spec: {
      placementRefs: [{name: metadata.name, rolloutStrategy: {type: 'All'}}],
      manifestWorkTemplate: {workload: {manifests: [structuredClone(deployment)]}},
    }};
  return {placement, work};
};
export const placementRecordsFor = (snapshot, deployment) => deployment ?
  [...snapshot.placements, ...snapshot.works].filter(record =>
    record.resource.metadata.namespace === deployment.resource.metadata.namespace &&
    (record.resource.metadata.name === deployment.resource.metadata.name ||
      record.resource.metadata.labels?.['maas-admin.portal/model'] === deployment.resource.metadata.name)) : [];
export const modelLocations = records => [...new Set(records.filter(record => record.resource.kind === 'Placement')
  .flatMap(record => (record.resource.spec.predicates ?? []).flatMap(predicate =>
    (predicate.requiredClusterSelector?.labelSelector?.matchExpressions ?? [])
      .filter(expression => expression.key === 'location' && expression.operator === 'In')
      .flatMap(expression => expression.values ?? []))))].sort();
