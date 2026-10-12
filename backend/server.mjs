import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { GitResourceStore } from './GitResourceStore.mjs';
import { createApi } from './api.mjs';
const host=process.env.MAAS_API_HOST ?? '127.0.0.1';
const port=Number(process.env.MAAS_API_PORT ?? 8080);
if(!Number.isInteger(port) || port<1 || port>65535)throw new Error('MAAS_API_PORT must be between 1 and 65535.');
const store=new GitResourceStore({directory:process.env.MAAS_GIT_DIR ?? resolve('data/maas-git'),
  namespace:process.env.MAAS_NAMESPACE ?? 'maas',autoCommit:process.env.MAAS_GIT_AUTO_COMMIT==='true',seed:process.env.MAAS_GIT_SEED!=='false'});
await store.initialize();
const handle=createApi(store);
const server=createServer(async(incoming,outgoing)=>{
  try {
    let size=0;const chunks=[];
    for await (const chunk of incoming) {
      size+=chunk.length;
      if(size>1_048_576) {
        outgoing.writeHead(413,{'Content-Type':'application/json'});outgoing.end(JSON.stringify({code:'validation',message:'The request body is too large.'}));return;
      }
      chunks.push(chunk);
    }
    const method=incoming.method ?? 'GET';
    const headers=new Headers();for(const [key,value] of Object.entries(incoming.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);
    const request=new Request(`http://localhost${incoming.url}`,{method,headers,...(!['GET','HEAD'].includes(method)?{body:Buffer.concat(chunks)}:{})});
    const response=await handle(request);
    outgoing.writeHead(response.status,Object.fromEntries(response.headers));outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch(error) {
    console.error('HTTP request failed:',error);
    if(!outgoing.headersSent)outgoing.writeHead(500,{'Content-Type':'application/json'});
    outgoing.end(JSON.stringify({code:'unavailable',message:'The subscription service is unavailable.'}));
  }
});
server.on('error',error=>{console.error(`Unable to start API on ${host}:${port}:`,error.message);process.exitCode=1;});
server.requestTimeout=15000;server.headersTimeout=10000;
server.listen(port,host,()=>{
  console.log(`MaaS Git API: http://${host}:${port}/api`);
  console.log(`Data repository: ${store.directory} (automatic commits: ${store.autoCommit})`);
  process.send?.({type:'ready'});
});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),3000).unref();});
