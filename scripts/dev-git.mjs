import { spawn } from 'node:child_process';
let stopping=false;
const children=[];
function stop(code=0) {
  if(stopping)return;stopping=true;
  for(const child of children)child.kill('SIGTERM');
  process.exitCode=code;
}
const api=spawn(process.execPath,['backend/server.mjs'],{stdio:['inherit','inherit','inherit','ipc'],env:process.env});children.push(api);
const timeout=setTimeout(()=>{console.error('The Git API did not start within 15 seconds.');stop(1);},15000);
api.on('message',message=>{
  if(message?.type!=='ready' || stopping)return;
  clearTimeout(timeout);
  const ui=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1'],{stdio:'inherit',env:{...process.env,VITE_SUBSCRIPTION_SERVICE:'http',VITE_API_BASE_URL:'/api'}});
  children.push(ui);ui.on('exit',code=>stop(code ?? 0));ui.on('error',error=>{console.error(error.message);stop(1);});
});
api.on('exit',code=>{clearTimeout(timeout);stop(code ?? 0);});api.on('error',error=>{clearTimeout(timeout);console.error(error.message);stop(1);});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearTimeout(timeout);stop();});
