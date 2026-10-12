import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readdir, readFile, writeFile, rename, unlink, lstat, open } from 'node:fs/promises';
import { resolve, dirname, relative, sep } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { ApiError } from './errors.mjs';
import { projectName } from '../shared/subscription-validation.mjs';
import { serialize, revisionOf, seedResources } from './resources.mjs';
import { tenantInputSchema } from '../shared/tenant-validation.mjs';
import { managedClusterSchema } from '../shared/cluster-validation.mjs';
import { clusterDomain, eligibleLocations, seedClusters } from '../shared/grid-clusters.mjs';
const exec = promisify(execFile);
const marker = '.maas-store.json';
export class GitResourceStore {
  constructor({directory, namespace='maas', autoCommit=false, seed=true}) {
    this.directory=resolve(directory);this.namespace=projectName.parse(namespace);this.autoCommit=autoCommit;this.seed=seed;
    this.queue=Promise.resolve();
  }
  async git(...args) {
    const result=await exec('git',['-C',this.directory,...args],{maxBuffer:4*1024*1024});return result.stdout.trim();
  }
  async safePath(path) {
    const target=resolve(this.directory,path);
    if (target===this.directory || !target.startsWith(this.directory+sep)) throw new ApiError(400,'validation','Invalid resource path.');
    let current=this.directory;
    for (const part of relative(this.directory,target).split(sep)) {
      current=resolve(current,part);
      try {if ((await lstat(current)).isSymbolicLink()) throw new ApiError(409,'conflict','Symlinks are not supported in the resource repository.');}
      catch(error) {if(error.code!=='ENOENT')throw error;}
    }
    return target;
  }
  async initialize() {
    await mkdir(this.directory,{recursive:true});
    if ((await lstat(this.directory)).isSymbolicLink()) throw new Error('The data repository directory must not be a symlink.');
    const entries=await readdir(this.directory);
    if (entries.includes(marker)) {
      const config=JSON.parse(await readFile(await this.safePath(marker),'utf8'));
      if(config.format!==1 || config.namespace!==this.namespace) throw new Error('Data repository format or namespace does not match the backend configuration.');
      const top=await this.git('rev-parse','--show-toplevel');
      if(resolve(top)!==this.directory)throw new Error('Use a dedicated data repository, not a subdirectory of another repository.');
      await this.safePath('.git');
      if(this.seed)await this.initializeClusters();
      return;
    }
    if(entries.length)throw new Error('The data directory must be empty or an existing MaaS PoC repository.');
    await this.git('init','--initial-branch=main');
    await this.exclusive(async()=>{
      await writeFile(await this.safePath(marker),serialize({format:1,namespace:this.namespace}));
      if(this.seed)for(const entry of seedResources(this.namespace))await this.atomicWrite(entry.path,serialize(entry.resource));
      if(this.seed) {
        for(const resource of seedClusters())await this.atomicWrite(this.resourcePath('ManagedCluster',undefined,resource.metadata.name),serialize(resource));
        await this.atomicWrite('.maas-clusters.json',serialize({format:1}));
      }
      if(this.autoCommit) {
        await this.git('add','--',marker,...(this.seed ? ['models','clusters','.maas-clusters.json'] : []));
        await this.commit('Initialize MaaS resource repository');
      }
    });
  }
  async initializeClusters() {
    return this.exclusive(async()=>{
      try {await readFile(await this.safePath('.maas-clusters.json'),'utf8');return;}
      catch(error) {if(error.code!=='ENOENT')throw error;}
      if(this.autoCommit && await this.git('status','--porcelain'))throw new ApiError(409,'conflict','Commit existing changes before initializing the cluster catalog with automatic commits enabled.');
      const records=await this.records('clusters','ManagedCluster');const paths=[];
      if(records.length===0)for(const resource of seedClusters()) {
        const path=this.resourcePath('ManagedCluster',undefined,resource.metadata.name);paths.push(path);await this.atomicWrite(path,serialize(resource));
      }
      await this.atomicWrite('.maas-clusters.json',serialize({format:1}));paths.push('.maas-clusters.json');
      if(this.autoCommit) {await this.git('add','--',...paths);await this.commit('Initialize AI Grid cluster catalog');}
    });
  }
  async exclusive(callback) {
    const execute=async()=>{
      const path=await this.safePath('.git/maas-admin.lock');let lock;
      try {lock=await open(path,'wx');}
      catch(error) {if(error.code==='EEXIST')throw new ApiError(503,'unavailable','The data repository is locked by another operation. Try again.');throw error;}
      try {await lock.writeFile(serialize({pid:process.pid,started:new Date().toISOString()}));return await callback();}
      finally {await lock.close();await unlink(path);}
    };
    const result=this.queue.then(execute,execute);this.queue=result.catch(()=>{});return result;
  }
  resourcePath(kind,namespace,name) {
    const folder={'MaaSSubscription':'subscriptions','MaaSAuthPolicy':'authorization-policies','MaaSModelRef':'models','LLMInferenceService':'deployments','Placement':'placements','ManifestWorkReplicaSet':'manifest-work-replica-sets','Tenant':'tenants','ManagedCluster':'clusters'}[kind];
    if(!folder)throw new Error('Unsupported resource kind.');
    const filename=name.length<=240 ? name : `resource-${createHash('sha256').update(name).digest('hex')}`;
    return kind==='ManagedCluster' ? `${folder}/${filename}.json` : `${folder}/${namespace}/${filename}.json`;
  }
  async atomicWrite(path, content) {
    const target=await this.safePath(path);await mkdir(dirname(target),{recursive:true});
    const temporary=await this.safePath(`.git/maas-write-${randomUUID()}`);
    try {await writeFile(temporary,content,{flag:'wx'});await rename(temporary,target);}
    finally {await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
  }
  async records(folder,kind) {
    const result=[];
    const scan=async path=>{
      let entries;
      try {entries=await readdir(await this.safePath(path),{withFileTypes:true});}
      catch(error) {if(error.code==='ENOENT')return;throw error;}
      for(const entry of entries) {
        const child=`${path}/${entry.name}`;
        if(entry.isSymbolicLink())throw new ApiError(409,'conflict','Symlinks are not supported in the resource repository.');
        if(entry.isDirectory())await scan(child);
        else if(entry.isFile() && entry.name.endsWith('.json')) {
          const content=await readFile(await this.safePath(child),'utf8');let resource;
          try {resource=JSON.parse(content);}catch {throw new ApiError(503,'unavailable','A stored resource is not valid JSON. Check the data repository.');}
          if(resource.kind!==kind || typeof resource.metadata?.name!=='string' ||
            (kind==='ManagedCluster' ? !managedClusterSchema.safeParse(resource).success : kind!=='Group' && (resource.apiVersion!==({'LLMInferenceService':'serving.kserve.io/v1alpha2','Placement':'cluster.open-cluster-management.io/v1beta1','ManifestWorkReplicaSet':'work.open-cluster-management.io/v1alpha1','Tenant':'osac.portal/v1alpha1'}[kind] ?? 'maas.opendatahub.io/v1alpha1') || !resource.spec || typeof resource.metadata.namespace!=='string'))) {
            throw new ApiError(503,'unavailable','A stored resource has an invalid shape. Check the data repository.');
          }
          if(kind==='Tenant' && (!tenantInputSchema.safeParse({name:resource.metadata.name,...resource.spec}).success ||
            !resource.metadata.annotations?.['maas-admin.portal/created-at'] || !resource.metadata.annotations?.['maas-admin.portal/updated-at']))
            throw new ApiError(503,'unavailable','A stored tenant has an invalid shape. Check the data repository.');
          result.push({path:child,resource,revision:revisionOf(content)});
        }
      }
    };
    await scan(folder);
    const identities=result.map(({resource})=>`${resource.metadata.namespace ?? ''}/${resource.metadata.name}`);
    if(new Set(identities).size!==identities.length)throw new ApiError(503,'unavailable','The data repository contains duplicate resource identities.');
    return result;
  }
  async snapshotUnlocked() {
    const [subscriptions,policies,models,deployments,placements,works,clusters,tenants]=await Promise.all([
      this.records('subscriptions','MaaSSubscription'),this.records('authorization-policies','MaaSAuthPolicy'),
      this.records('models','MaaSModelRef'),this.records('deployments','LLMInferenceService'),
      this.records('placements','Placement'),this.records('manifest-work-replica-sets','ManifestWorkReplicaSet'),this.records('clusters','ManagedCluster'),
      this.records('tenants','Tenant'),
    ]);
    return {subscriptions:subscriptions.filter(r=>r.resource.metadata.namespace===this.namespace),
      policies:policies.filter(r=>r.resource.metadata.namespace===this.namespace),models,deployments,placements,works,clusters,
      locations:eligibleLocations(clusters.map(record=>clusterDomain(record.resource))),
      tenants:tenants.filter(r=>r.resource.metadata.namespace===this.namespace)};
  }
  async locations() {
    return eligibleLocations((await this.records('clusters','ManagedCluster')).map(record=>clusterDomain(record.resource)));
  }
  async snapshot() {return this.exclusive(()=>this.snapshotUnlocked());}
  async commit(message) {
    await this.git('-c','user.name=MaaS Admin PoC','-c','user.email=maas-admin@localhost','commit','--no-gpg-sign','-m',message);
  }
  async transaction(message, prepare) {
    return this.exclusive(async()=>{
      if(this.autoCommit && await this.git('status','--porcelain'))throw new ApiError(409,'conflict','The data repository has uncommitted changes. Commit or resolve them before using automatic commits.');
      const snapshot=await this.snapshotUnlocked();
      const {changes,result}=await prepare(snapshot);
      const previous=new Map();
      for(const {path} of changes) {
        try {previous.set(path,await readFile(await this.safePath(path),'utf8'));}
        catch(error) {if(error.code!=='ENOENT')throw error;previous.set(path,undefined);}
      }
      try {
        for(const {path,resource} of changes) {
          if(resource===null)await unlink(await this.safePath(path));
          else await this.atomicWrite(path,serialize(resource));
        }
        if(this.autoCommit) {
          await this.git('add','--',...changes.map(change=>change.path));
          if(await this.git('diff','--cached','--name-only'))await this.commit(message);
        }
      } catch(error) {
        try {
          for(const [path,content] of previous) {
            if(content===undefined)await unlink(await this.safePath(path)).catch(err=>{if(err.code!=='ENOENT')throw err;});
            else await this.atomicWrite(path,content);
          }
          if(this.autoCommit)await this.git('reset','--quiet','HEAD','--',...changes.map(change=>change.path));
        } catch(rollbackError) {console.error('Resource transaction rollback failed:',rollbackError);}
        console.error('Resource transaction failed:',error);
        throw new ApiError(503,'unavailable','The resource change could not be saved to Git. Check the backend logs and repository.');
      }
      return result;
    });
  }
}
