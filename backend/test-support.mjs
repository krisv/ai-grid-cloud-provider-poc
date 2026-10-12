// In-process transport tests use temporary real Git repositories; no socket required.
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitResourceStore } from './GitResourceStore.mjs';
export async function createTestStore() {
  const directory=await mkdtemp(join(tmpdir(),'maas-ui-git-test-'));
  const store=new GitResourceStore({directory});await store.initialize();return store;
}
export async function removeTestStore(store) {await store.queue;await rm(store.directory,{recursive:true,force:true});}
export async function readStoredResource(directory,path) {return JSON.parse(await readFile(join(directory,path),'utf8'));}
export async function writeStoredResource(directory,path,resource) {await writeFile(join(directory,path),`${JSON.stringify(resource,null,2)}\n`);}
