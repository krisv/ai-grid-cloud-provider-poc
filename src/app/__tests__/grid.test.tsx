import { render,screen,within,waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { it,expect,vi } from 'vitest';
import App from '../App';
import { configureSubscriptionService } from '~/services/subscriptions/configuredService';
import { MockSubscriptionService } from '~/services/subscriptions/MockSubscriptionService';
async function addTenants(service:MockSubscriptionService) {
 for(const name of ['coca-cola','pepsi'])await service.createTenant({name,domains:[`${name}.example.com`],identityProvider:{title:'',description:'',enabled:true,config:{clientId:name,clientSecretSecret:{name:'secret'},issuer:'https://sso.example.com',authorizationUrl:'https://sso.example.com/auth',tokenUrl:'https://sso.example.com/token',defaultScopes:'',userInfoUrl:'',jwksUrl:'',logoutUrl:'',validateSignature:true}}});
}
// Exercise the page and drawer without a browser map renderer or external tiles.
vi.mock('../pages/grid/GridFleetMap',()=>({default:({clusters,onSelect}:{clusters:Array<{name:string}>;onSelect:(name:string)=>void})=><div aria-label="AI Grid map of clusters">{clusters.map(c=><button key={c.name} onClick={()=>onSelect(c.name)}>{`Map pin ${c.name}`}</button>)}</div>}));
it('uses the reference map-and-drawer layout and opens cluster details from a pin',async()=>{
 configureSubscriptionService(new MockSubscriptionService());const user=userEvent.setup();
 render(<MemoryRouter initialEntries={['/ai-grid']}><App/></MemoryRouter>);
 expect(await screen.findByText('Inventory on this page is simulated.')).toBeVisible();
 expect(screen.getByLabelText('Fleet summary')).toBeVisible();
 await user.click(await screen.findByRole('button',{name:'Map pin demo-brussels'}));
 expect(screen.getByRole('heading',{name:'demo-brussels'})).toBeVisible();
 expect(screen.getByText('50.8503, 4.3517')).toBeVisible();
 await user.click(screen.getByRole('button',{name:'Clusters'}));
 expect(screen.getByRole('button',{name:'View demo-new-york details'})).toBeVisible();
 expect(screen.queryByRole('combobox',{name:'Filter by site'})).not.toBeInTheDocument();
});
it('filters the drawer and map by availability while retaining inventory summaries',async()=>{
 configureSubscriptionService(new MockSubscriptionService());const user=userEvent.setup();
 render(<MemoryRouter initialEntries={['/ai-grid']}><App/></MemoryRouter>);
 await screen.findByRole('button',{name:'View demo-new-york details'});
 await user.click(within(screen.getByRole('group',{name:'Filter cluster availability'})).getByRole('button',{name:'Offline'}));
 expect(screen.getByRole('button',{name:'View demo-new-york details'})).toBeVisible();
 expect(screen.queryByRole('button',{name:'View demo-brussels details'})).not.toBeInTheDocument();
 expect(screen.getByLabelText('Fleet summary')).toBeVisible();
});

it('switches between clusters and models and follows placement cross-links',async()=>{
 const service=new MockSubscriptionService();await addTenants(service);const models=await service.listModels();
 vi.spyOn(service,'listModels').mockResolvedValue([{...models[0],locations:['brussels'],hasDeployment:true}]);
 configureSubscriptionService(service);const user=userEvent.setup();
 render(<MemoryRouter initialEntries={['/ai-grid']}><App/></MemoryRouter>);
 await screen.findByRole('button',{name:'View demo-brussels details'});
 const card=screen.getByRole('button',{name:'View demo-brussels details'}).closest('article')!;
 await user.click(await within(card).findByRole('button',{name:models[0].displayName ?? models[0].name}));
 expect(screen.getByRole('heading',{name:'Model configuration'})).toBeVisible();
 await user.click(screen.getByRole('button',{name:'Brussels · demo-brussels'}));
 expect(screen.getByRole('heading',{name:'Site and cluster'})).toBeVisible();
 await user.click(screen.getByRole('button',{name:'Back'}));
 expect(screen.getByRole('heading',{name:'Model configuration'})).toBeVisible();
 await user.click(screen.getByRole('button',{name:'Clusters'}));
 await user.click(within(screen.getByRole('group',{name:'Grid object type'})).getByRole('button',{name:'Models'}));
 expect(screen.getByRole('heading',{name:'Models'})).toBeVisible();
 expect(screen.getByRole('button',{name:'Brussels · demo-brussels'})).toBeVisible();
 expect(screen.queryByText('GPU utilization')).not.toBeInTheDocument();
 expect(screen.queryByText('Fleet metrics')).not.toBeInTheDocument();
});

it('labels metric simulation independently of real backend inventory in Monitoring',async()=>{
 const service=new MockSubscriptionService();await addTenants(service);const value=await service.getGridOverview('1h');
 vi.spyOn(service,'getGridOverview').mockResolvedValue({...value,demo:false,inventorySource:'git',metricsSource:'demo'});
 configureSubscriptionService(service);
 render(<MemoryRouter initialEntries={['/monitoring']}><App/></MemoryRouter>);
 expect(await screen.findByText('Simulated monitoring metrics')).toBeVisible();
 expect(screen.getByRole('heading',{name:'GPU utilization'})).toBeVisible();
 expect(screen.getByRole('heading',{name:'Gateway request rate'})).toBeVisible();
});

it('updates monitoring chart windows through time controls',async()=>{
 const service=new MockSubscriptionService();await addTenants(service);const query=vi.spyOn(service,'getGridOverview');
 configureSubscriptionService(service);const user=userEvent.setup();
 render(<MemoryRouter initialEntries={['/monitoring']}><App/></MemoryRouter>);
 const chart=await screen.findByRole('img',{name:'Gateway request rate over time'});
 expect(Number(chart.getAttribute('data-end'))-Number(chart.getAttribute('data-start'))).toBe(3600);
 await user.click(within(screen.getByRole('group',{name:'Time range'})).getByRole('button',{name:'Last 24h'}));
 await waitFor(()=>{const c=screen.getByRole('img',{name:'Gateway request rate over time'});expect(Number(c.getAttribute('data-end'))-Number(c.getAttribute('data-start'))).toBe(86400);});
 expect(screen.queryByRole('combobox',{name:'Filter by site'})).not.toBeInTheDocument();
 expect(query).toHaveBeenCalledWith('24h');
});
it('provides reference-style tabs, expandable chart sections, and a working model selector',async()=>{
 const service=new MockSubscriptionService();await addTenants(service);const models=await service.listModels();configureSubscriptionService(service);const user=userEvent.setup();
 render(<MemoryRouter initialEntries={['/monitoring']}><App/></MemoryRouter>);
 await screen.findByRole('img',{name:'GPU utilization over time'});
 expect(screen.getByRole('heading',{name:'Observability dashboard'})).toBeVisible();
 await user.click(screen.getByRole('button',{name:'Cluster resource overview'}));
 expect(screen.queryByRole('img',{name:'GPU utilization over time'})).not.toBeInTheDocument();
 await user.click(screen.getByRole('tab',{name:'Usage'}));
 expect(await screen.findByRole('img',{name:'Token consumption by tenant'})).toBeVisible();
 expect(within(screen.getByRole('table',{name:'Tenant usage'})).getByText('coca-cola',{selector:'td'})).toBeVisible();
 expect(within(screen.getByRole('table',{name:'Tenant usage'})).getByText('pepsi',{selector:'td'})).toBeVisible();
 expect(screen.queryByText('NorthSummit Bank')).not.toBeInTheDocument();
 expect(screen.getByRole('img',{name:'Token consumption by tenant'}).querySelectorAll('[data-kind="cached"]')).toHaveLength(2);
 expect(screen.queryByText('Quota utilization')).not.toBeInTheDocument();
 expect(screen.queryByRole('columnheader',{name:'Quota used'})).not.toBeInTheDocument();
 await user.click(screen.getByRole('tab',{name:'Models'}));
 const selector=screen.getByRole('combobox',{name:'Select model deployment'});
 await user.selectOptions(selector,models[0].name);
 expect(within(screen.getByRole('table',{name:'Model deployments'})).getAllByRole('row')).toHaveLength(2);
 expect(screen.getByRole('img',{name:'Request queue length over time'})).toBeVisible();
 expect(screen.getByRole('img',{name:'P90 Time to first token (TTFT) over time'})).toBeVisible();
 expect(screen.queryByRole('tab',{name:'Gateway'})).not.toBeInTheDocument();
});

it('shows all sites without a selector and recalculates overview totals for the time window',async()=>{
 const service=new MockSubscriptionService();await addTenants(service);configureSubscriptionService(service);const user=userEvent.setup();
 render(<MemoryRouter initialEntries={['/monitoring']}><App/></MemoryRouter>);
 await screen.findByRole('img',{name:'Gateway request rate over time'});
 const overview=()=>screen.getByText('Requests in window').closest('.observability-stat-card')!.textContent;
 const first=overview();
 await user.click(screen.getByRole('button',{name:'Last 24h'}));
 await waitFor(()=>expect(overview()).not.toBe(first));
 expect(screen.queryByRole('combobox',{name:'Filter by site'})).not.toBeInTheDocument();
 expect(screen.getByText('demo-san-francisco')).toBeVisible();
 expect(screen.getByText('demo-new-york')).toBeVisible();
});
it('changes simulated model charts with model selection and tenant usage with the time window',async()=>{
 const service=new MockSubscriptionService();await addTenants(service);const models=await service.listModels();configureSubscriptionService(service);const user=userEvent.setup();
 render(<MemoryRouter initialEntries={['/monitoring']}><App/></MemoryRouter>);
 await screen.findByRole('img',{name:'Gateway request rate over time'});
 await user.click(screen.getByRole('tab',{name:'Models'}));
 const all=screen.getByRole('img',{name:'Request queue length over time'}).querySelector('path')!.getAttribute('d');
 await user.selectOptions(screen.getByRole('combobox',{name:'Select model deployment'}),models[0].name);
 expect(screen.getByRole('img',{name:'Request queue length over time'}).querySelector('path')!.getAttribute('d')).not.toBe(all);
 await user.click(screen.getByRole('tab',{name:'Usage'}));
 const before=screen.getByRole('table',{name:'Tenant usage'}).textContent;
 const beforeHeight=screen.getByRole('img',{name:'Token consumption by tenant'}).querySelector('[data-kind="input"]')!.getAttribute('height');
 await user.click(screen.getByRole('button',{name:'Last 6h'}));
 await waitFor(()=>expect(screen.getByRole('table',{name:'Tenant usage'}).textContent).not.toBe(before));
 expect(screen.getByRole('img',{name:'Token consumption by tenant'})).toBeVisible();
 expect(screen.getByRole('img',{name:'Token consumption by tenant'}).querySelector('[data-kind="input"]')!.getAttribute('height')).not.toBe(beforeHeight);
 expect(screen.getByText(/Total consumption:.*Last 6h/)).toBeVisible();
});
