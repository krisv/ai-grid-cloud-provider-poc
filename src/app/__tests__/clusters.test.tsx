import { beforeEach, expect, it } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { createApi } from '../../../backend/api.mjs';
import { ACMHubClient } from '../../../backend/ACMHubClient.mjs';
import { HttpSubscriptionService } from '~/services/subscriptions/HttpSubscriptionService';
import { configureSubscriptionService } from '~/services/subscriptions/configuredService';
const resource=(name:string,available:string,labels:Record<string,string>={})=>({apiVersion:'cluster.open-cluster-management.io/v1',kind:'ManagedCluster',
  metadata:{name,labels},status:{conditions:[{type:'ManagedClusterConditionAvailable',status:available}]}});
let clusters:ReturnType<typeof resource>[];let calls:Array<{method:string;body?:string;url:URL}>;let forbidden:boolean;let unavailable:boolean;
beforeEach(()=>{
  clusters=[resource('cluster-a','True',{'ai-grid/enabled':'true','ai-grid/provisioned':'true',location:'site1'}),resource('cluster-b','True',{location:'site2'}),resource('cluster-c','False')];
  calls=[];forbidden=false;unavailable=false;
  const hub=new ACMHubClient({env:{ACM_HUB_URL:'https://hub.example.com',ACM_HUB_TOKEN:'server-only-token'},transport:async call=>{
    calls.push(call);
    if(unavailable)return {status:503,body:'upstream failure'};
    if(call.method==='PATCH') {
      if(forbidden)return {status:403,body:'raw private Hub error'};
      const name=call.url.pathname.split('/').at(-1);const index=clusters.findIndex(cluster=>cluster.metadata.name===name);
      const patch=JSON.parse(call.body!);clusters[index].metadata.labels={...clusters[index].metadata.labels,...patch.metadata.labels};
      return {status:200,body:JSON.stringify(clusters[index])};
    }
    return {status:200,body:JSON.stringify({kind:'ManagedClusterList',apiVersion:'cluster.open-cluster-management.io/v1',items:clusters})};
  }});
  const api=createApi({snapshot:async()=>({models:[],deployments:[],placements:[],works:[],locations:[],subscriptions:[],policies:[],tenants:[]})} as never,{hub});
  configureSubscriptionService(new HttpSubscriptionService('/api',(url,options)=>api(new Request(new URL(String(url),'http://localhost'),options))));
});
it('lists live Hub states, puts Clusters first and enrolls with a label-only PATCH',async()=>{
  const user=userEvent.setup();render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
  const table=await screen.findByTestId('clusters-table');
  const nav=screen.getByRole('navigation',{name:'Portal navigation'});
  expect(within(nav).getAllByRole('link').map(link=>link.textContent)).toEqual(['Clusters','Tenants','Models','Subscriptions']);
  const member=within(table).getByText('cluster-a').closest('tr')!;expect(member).toHaveTextContent('AI Grid Member');
  expect(within(member).queryByRole('button')).not.toBeInTheDocument();
  const offline=within(table).getByText('cluster-c').closest('tr')!;expect(offline).toHaveTextContent('Offline');expect(offline).toHaveTextContent('Not enrolled');
  await user.click(screen.getByRole('button',{name:'Add cluster-b to AI Grid'}));
  await waitFor(()=>expect(screen.queryByRole('button',{name:'Add cluster-b to AI Grid'})).not.toBeInTheDocument());
  expect(await screen.findByText('cluster-b added to AI Grid')).toBeVisible();
  const patch=calls.find(call=>call.method==='PATCH')!;expect(JSON.parse(patch.body!)).toEqual({metadata:{labels:{'ai-grid/enabled':'true'}}});
  expect(clusters[1].metadata.labels.location).toBe('site2');
  await user.type(screen.getByRole('textbox',{name:'Search clusters'}),'cluster-c');
  expect(within(screen.getByTestId('clusters-table')).queryByText('cluster-a')).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Add cluster-c to AI Grid'})).toBeEnabled();
});
it('keeps an unenrolled cluster on patch failure and allows a retry',async()=>{
  forbidden=true;const user=userEvent.setup();render(<MemoryRouter initialEntries={['/clusters']}><App /></MemoryRouter>);
  await user.click(await screen.findByRole('button',{name:'Add cluster-b to AI Grid'}));
  expect(await screen.findByText('The backend does not have permission to list or patch ACM ManagedClusters.')).toBeVisible();
  expect(screen.getByRole('button',{name:'Add cluster-b to AI Grid'})).toBeEnabled();
  expect(clusters[1].metadata.labels['ai-grid/enabled']).toBeUndefined();
  forbidden=false;await user.click(screen.getByRole('button',{name:'Add cluster-b to AI Grid'}));
  expect(await screen.findByText('cluster-b added to AI Grid')).toBeVisible();
});
it('reports Hub unavailability and retries instead of showing a false empty list',async()=>{
  unavailable=true;const user=userEvent.setup();render(<MemoryRouter initialEntries={['/clusters']}><App /></MemoryRouter>);
  expect(await screen.findByText('The ACM Hub request failed. Try again.')).toBeVisible();expect(screen.queryByText('No managed clusters')).not.toBeInTheDocument();
  unavailable=false;await user.click(screen.getByRole('button',{name:'Retry'}));expect(await screen.findByTestId('clusters-table')).toHaveTextContent('cluster-a');
});
it('refresh reflects external membership changes on the Hub',async()=>{
  const user=userEvent.setup();render(<MemoryRouter initialEntries={['/clusters']}><App /></MemoryRouter>);
  await user.click(await screen.findByRole('button',{name:'Add cluster-b to AI Grid'}));
  expect(await screen.findByText('cluster-b added to AI Grid')).toBeVisible();delete clusters[1].metadata.labels['ai-grid/enabled'];
  await user.click(screen.getByRole('button',{name:'Refresh'}));
  expect(await screen.findByRole('button',{name:'Add cluster-b to AI Grid'})).toBeEnabled();
});
