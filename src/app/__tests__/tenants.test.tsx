import { beforeEach, afterEach, expect, it } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { createTestStore, removeTestStore, readStoredResource } from '../../../backend/test-support.mjs';
import { createApi } from '../../../backend/api.mjs';
import { GitResourceStore } from '../../../backend/GitResourceStore.mjs';
import { configureSubscriptionService } from '~/services/subscriptions/configuredService';
import { HttpSubscriptionService } from '~/services/subscriptions/HttpSubscriptionService';
import { MockSubscriptionService } from '~/services/subscriptions/MockSubscriptionService';
import { ServiceError } from '~/services/subscriptions/SubscriptionService';
import type { TenantInput } from '~/app/types/tenants';
let store:GitResourceStore;let service:HttpSubscriptionService;
beforeEach(async()=>{
  store=await createTestStore();const api=createApi(store);
  service=new HttpSubscriptionService('/api',(url,options)=>api(new Request(new URL(String(url),'http://localhost'),options)));
  configureSubscriptionService(service);
});
afterEach(async()=>removeTestStore(store));
const input:TenantInput={name:'tenant1',domains:['tenant1.example.com'],identityProvider:{title:'Tenant 1 SSO',description:'SSO configuration',enabled:true,
  config:{clientId:'tenant1-client',clientSecretSecret:{name:'tenant1-secret'},issuer:'https://sso.example.com/tenant1',
    authorizationUrl:'https://sso.example.com/auth',tokenUrl:'https://sso.example.com/token',defaultScopes:'openid profile email',
    userInfoUrl:'',jwksUrl:'',logoutUrl:'',validateSignature:true}}};
it('onboards tenant details then IdP, saves only after review, supports details/edit/delete and orders navigation',async()=>{
  const user=userEvent.setup();render(<MemoryRouter initialEntries={['/tenants']}><App /></MemoryRouter>);
  expect(await screen.findByRole('heading',{name:'Tenants'})).toBeVisible();
  const nav=screen.getByRole('navigation',{name:'Portal navigation'});
  expect(within(nav).getAllByRole('link').map(link=>link.textContent)).toEqual(['Clusters','Tenants','Models','Subscriptions']);
  await user.click(await screen.findByRole('link',{name:'Create tenant'}));
  const name=await screen.findByRole('textbox',{name:'Name'});
  expect(screen.getByRole('button',{name:'Next'})).toBeDisabled();await user.type(name,'tenant1');
  await user.click(screen.getByRole('button',{name:'Add domain'}));await user.type(screen.getByRole('textbox',{name:'Domain 1'}),'tenant1.example.com');
  await user.click(screen.getByRole('button',{name:'Add domain'}));await user.click(screen.getByRole('button',{name:'Remove domain 2'}));
  await user.click(screen.getByRole('button',{name:'Next'}));
  expect(screen.getByRole('button',{name:'Next'})).toBeDisabled();expect(await service.listTenants()).toEqual([]);
  for(const [label,value] of [['Title','Tenant 1 SSO'],['Client ID','tenant1-client'],['Client secret reference','tenant1-secret'],
    ['Issuer','https://sso.example.com/tenant1'],['Authorization URL','https://sso.example.com/auth'],['Token URL','https://sso.example.com/token']])
    await user.type(screen.getByRole('textbox',{name:label}),value);
  await user.click(screen.getByRole('button',{name:'Next'}));
  expect(screen.getByTestId('tenant-configuration-details')).toHaveTextContent('tenant1.example.com');
  expect(screen.getByTestId('tenant-configuration-details')).toHaveTextContent('Tenant 1 SSO');
  expect(screen.queryByText(/break.glass/i)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:'Create tenant'}));
  const table=await screen.findByTestId('tenants-table');expect(table).toHaveTextContent('Saved');expect(table).toHaveTextContent('tenant1.example.com');
  const resource=await readStoredResource(store.directory,'tenants/maas/tenant1.json');expect(resource.spec.identityProvider.config.clientSecretSecret.name).toBe('tenant1-secret');
  await user.click(within(table).getByRole('link',{name:'tenant1'}));
  expect(await screen.findByTestId('tenant-configuration-details')).toHaveTextContent('https://sso.example.com/tenant1');
  await user.click(screen.getByRole('link',{name:'Edit tenant'}));
  expect(await screen.findByRole('textbox',{name:'Name'})).toBeDisabled();
  await user.click(screen.getByRole('button',{name:'Next'}));
  const title=screen.getByRole('textbox',{name:'Title'});await user.clear(title);await user.type(title,'Updated SSO');
  await user.click(screen.getByRole('button',{name:'Next'}));await user.click(screen.getByRole('button',{name:'Save changes'}));
  expect(await screen.findByTestId('tenants-table')).toHaveTextContent('Updated SSO');
  await user.click(screen.getByTestId('tenant-actions-tenant1'));await user.click(screen.getByRole('menuitem',{name:'Delete'}));
  const modal=await screen.findByTestId('delete-tenant-modal');await user.type(within(modal).getByTestId('delete-modal-input'),'tenant1');
  await user.click(within(modal).getByRole('button',{name:'Delete'}));
  await waitFor(()=>expect(screen.queryByTestId('tenants-table')).not.toBeInTheDocument());expect(await service.listTenants()).toEqual([]);
},15000);
it('keeps onboarding input on conflicts and allows cancel without saving',async()=>{
  await service.createTenant(input);const user=userEvent.setup();render(<MemoryRouter initialEntries={['/tenants/create']}><App /></MemoryRouter>);
  await user.type(await screen.findByRole('textbox',{name:'Name'}),'tenant1');await user.click(screen.getByRole('button',{name:'Next'}));
  for(const [label,value] of [['Client ID','client'],['Client secret reference','secret'],['Issuer','https://idp.example.com'],
    ['Authorization URL','https://idp.example.com/auth'],['Token URL','https://idp.example.com/token']])await user.type(screen.getByRole('textbox',{name:label}),value);
  await user.click(screen.getByRole('button',{name:'Next'}));await user.click(screen.getByRole('button',{name:'Create tenant'}));
  expect(await screen.findByText('A tenant with this name already exists.')).toBeVisible();
  expect(screen.getByTestId('tenant-configuration-details')).toHaveTextContent('tenant1');
  await user.click(screen.getByRole('button',{name:'Cancel'}));expect(await screen.findByTestId('tenants-table')).toHaveTextContent('Tenant 1 SSO');
  expect(await service.listTenants()).toHaveLength(1);
});
it('persists mock tenant configuration and protects edits from stale revisions',async()=>{
  const data=new Map<string,string>();const storage={getItem:(key:string)=>data.get(key) ?? null,setItem:(key:string,value:string)=>data.set(key,value)} as unknown as Storage;
  const mock=new MockSubscriptionService({storage});const tenant=await mock.createTenant(input);
  const restarted=new MockSubscriptionService({storage});expect(await restarted.getTenant('tenant1')).toEqual(tenant);
  const next=await restarted.updateTenant('tenant1',{...input,domains:[]},tenant.revision);
  await expect(mock.deleteTenant('tenant1',tenant.revision)).rejects.toMatchObject({code:'conflict'});
  await restarted.deleteTenant('tenant1',next.revision);expect(await mock.listTenants()).toEqual([]);
});
it('shows a retry action when tenant loading fails',async()=>{
  const mock=new MockSubscriptionService();mock.failNext('listTenants',new ServiceError('unavailable','Tenant service unavailable.'));configureSubscriptionService(mock);
  const user=userEvent.setup();render(<MemoryRouter initialEntries={['/tenants']}><App /></MemoryRouter>);
  expect(await screen.findByText('Tenant service unavailable.')).toBeVisible();await user.click(screen.getByRole('button',{name:'Retry'}));
  expect(await screen.findByText('No tenants yet. Register one to get started.')).toBeVisible();
});
it('opens details for a tenant whose name matches the create route',async()=>{
  await service.createTenant({...input,name:'create',domains:[]});
  const user=userEvent.setup();render(<MemoryRouter initialEntries={['/tenants']}><App /></MemoryRouter>);
  const table=await screen.findByTestId('tenants-table');await user.click(within(table).getByRole('link',{name:'create'}));
  expect(await screen.findByTestId('tenant-configuration-details')).toHaveTextContent('Tenant 1 SSO');
  expect(screen.queryByRole('textbox',{name:'Name'})).not.toBeInTheDocument();
});
it.each(['create','edit'])('Back returns from %s to the tenant list without saving',async mode=>{
  const existing=await service.createTenant(input);
  const user=userEvent.setup();render(<MemoryRouter initialEntries={[mode==='create' ? '/tenants/create' : '/tenants/tenant1/edit']}><App /></MemoryRouter>);
  const name=await screen.findByRole('textbox',{name:'Name'});
  if(mode==='create')await user.type(name,'unsaved-tenant');
  await user.click(screen.getByRole('button',{name:'Next'}));
  const title=screen.getByRole('textbox',{name:'Title'});await user.clear(title);await user.type(title,'Unsaved IdP');
  await user.click(screen.getByRole('button',{name:'Back'}));
  expect(screen.getByRole('textbox',{name:'Name'})).toHaveValue(mode==='create' ? 'unsaved-tenant' : 'tenant1');
  await user.click(screen.getByRole('button',{name:'Back'}));
  expect(await screen.findByTestId('tenants-table')).toHaveTextContent('Tenant 1 SSO');
  expect(await service.listTenants()).toEqual([existing]);
});
