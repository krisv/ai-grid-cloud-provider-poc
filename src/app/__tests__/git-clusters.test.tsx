import { expect, it } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { createTestStore, removeTestStore, readStoredResource, writeStoredResource } from '../../../backend/test-support.mjs';
import { createApi } from '../../../backend/api.mjs';
import { configureSubscriptionService } from '~/services/subscriptions/configuredService';
import { HttpSubscriptionService } from '~/services/subscriptions/HttpSubscriptionService';
it('shows the Git provisioning lifecycle and adds a manually completed site to deployment locations',async()=>{
  const store=await createTestStore();
  try {
    const api=createApi(store,{env:{}});const service=new HttpSubscriptionService('/api',(url,options)=>api(new Request(new URL(String(url),'http://localhost'),options)));
    configureSubscriptionService(service);const user=userEvent.setup();render(<MemoryRouter initialEntries={['/clusters']}><App /></MemoryRouter>);
    const add=await screen.findByRole('button',{name:'Add site4 to AI Grid'});const row=add.closest('tr')!;
    expect(row).toHaveTextContent('Not provisioned');expect(within(screen.getByTestId('clusters-table')).getAllByText('Provisioned')).toHaveLength(3);
    await user.click(add);expect(await screen.findByText('site4 added to AI Grid')).toBeVisible();
    await waitFor(()=>expect(screen.getByRole('row',{name:/site4/})).toHaveTextContent('Provisioning'));
    expect(await service.listLocations()).toEqual(['site1','site2','site3']);
    const resource=await readStoredResource(store.directory,'clusters/site4.json');resource.metadata.labels['ai-grid/provisioned']='true';
    await writeStoredResource(store.directory,'clusters/site4.json',resource);await user.click(screen.getByRole('button',{name:'Refresh'}));
    await waitFor(()=>expect(screen.getByRole('row',{name:/site4/})).toHaveTextContent('Provisioned'));
    expect(await service.listLocations()).toEqual(['site1','site2','site3','site4']);
  } finally {await removeTestStore(store);}
});
