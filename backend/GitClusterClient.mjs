import { ApiError } from './errors.mjs';
import { clusterDomain, eligibleLocations } from '../shared/grid-clusters.mjs';
export class GitClusterClient {
  mode='git';
  constructor(store) {this.store=store;}
  async list() {
    return this.store.exclusive(async()=>(await this.store.records('clusters','ManagedCluster'))
      .map(record=>clusterDomain(record.resource)).sort((a,b)=>a.name.localeCompare(b.name)));
  }
  async locations() {return eligibleLocations(await this.list());}
  async enroll(name) {
    return this.store.transaction(`Add cluster ${name} to AI Grid`,snapshot=>{
      const record=snapshot.clusters.find(record=>record.resource.metadata.name===name);
      if(!record)throw new ApiError(404,'not_found','This ManagedCluster could not be found in Git.');
      const resource=structuredClone(record.resource);
      resource.metadata.labels={...resource.metadata.labels,'ai-grid/enabled':'true'};
      // Enrollment records intent; provisioning completion is supplied externally.
      return {changes:[{path:record.path,resource}],result:clusterDomain(resource)};
    });
  }
}
