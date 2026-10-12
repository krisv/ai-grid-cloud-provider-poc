// Adapted from OSAC osac-ui/libs/ui-components/src/components/Tenant/TenantListPage.tsx
// and TenantActionsMenu.tsx at commit 8cb0a227e45cc9b17421b6e79ce493ed370ebd5d.
import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button, EmptyState, EmptyStateActions, EmptyStateBody, EmptyStateFooter, Label,
  PageSection, SearchInput, Toolbar, ToolbarContent, ToolbarItem } from '@patternfly/react-core';
import { Tbody, Td, Tr } from '@patternfly/react-table';
import { ApplicationsPage, Table, type SortableData } from '~/shared/dashboard';
import SimpleMenuActions from '~/shared/components/SimpleMenuActions';
import DeleteModal from '~/app/shared/DeleteModal';
import { useServiceData } from '~/shared/hooks/useServiceData';
import { getSubscriptionService } from '~/services/subscriptions/configuredService';
import type { Tenant } from '~/app/types/tenants';
const columns:SortableData<Tenant>[]=[
  {label:'Tenant',field:'name',sortable:(a,b)=>a.name.localeCompare(b.name)},
  {label:'Status',field:'status',sortable:(a,b)=>a.status.localeCompare(b.status)},
  {label:'Primary domain',field:'domains',sortable:(a,b)=>(a.domains[0] ?? '').localeCompare(b.domains[0] ?? '')},
  {label:'Identity provider',field:'identityProvider',sortable:(a,b)=>a.identityProvider.title.localeCompare(b.identityProvider.title)},
  {label:'Registered',field:'creationTimestamp',sortable:(a,b)=>a.creationTimestamp.localeCompare(b.creationTimestamp)},
];
export default function TenantListPage() {
  const service=getSubscriptionService();const navigate=useNavigate();
  const [tenants,loaded,error,refresh]=useServiceData(useCallback(()=>service.listTenants(),[service]),[]);
  const [search,setSearch]=useState('');const [selected,setSelected]=useState<Tenant>();
  const [deleting,setDeleting]=useState(false);const [deleteError,setDeleteError]=useState<Error>();
  const filtered=useMemo(()=>tenants.filter(tenant=>tenant.name.toLowerCase().includes(search.toLowerCase())),[tenants,search]);
  const createButton=<Button component={props=><Link {...props} to="/tenants/create" />}>Create tenant</Button>;
  const remove=async()=>{
    if(!selected || deleting)return;
    setDeleting(true);setDeleteError(undefined);
    try {await service.deleteTenant(selected.name,selected.revision);setSelected(undefined);refresh();}
    catch(err){setDeleteError(err instanceof Error ? err : new Error('The tenant could not be deleted.'));}
    finally{setDeleting(false);}
  };
  return <ApplicationsPage title="Tenants" description="Manage tenants and their identity providers." loaded={loaded || !!error} empty={false}>
    <PageSection>
      {error ? <Alert isInline variant="danger" title="Error loading tenants">{error.message}<Button variant="link" onClick={refresh}>Retry</Button></Alert> :
        tenants.length===0 ? <EmptyState titleText="No tenants" headingLevel="h2">
          <EmptyStateBody>No tenants yet. Register one to get started.</EmptyStateBody>
          <EmptyStateFooter><EmptyStateActions>{createButton}</EmptyStateActions></EmptyStateFooter>
        </EmptyState> : <Table data={filtered} columns={columns} aria-label="Tenants" data-testid="tenants-table"
          toolbarContent={<Toolbar><ToolbarContent><ToolbarItem><SearchInput aria-label="Search tenants" placeholder="Search tenants by name"
            value={search} onChange={(_,value)=>setSearch(value)} onClear={()=>setSearch('')} /></ToolbarItem><ToolbarItem>{createButton}</ToolbarItem></ToolbarContent></Toolbar>}
          emptyTableView={<p>No tenants match your search.</p>}
          rowRenderer={tenant=><Tbody key={tenant.name}><Tr>
            <Td dataLabel="Tenant"><Link to={`/tenants/view/${encodeURIComponent(tenant.name)}`}>{tenant.name}</Link></Td>
            <Td dataLabel="Status"><Label color="blue">{tenant.status}</Label></Td>
            <Td dataLabel="Primary domain">{tenant.domains[0] ?? '—'}</Td>
            <Td dataLabel="Identity provider">{tenant.identityProvider.title || 'OIDC'}<p>{tenant.identityProvider.config.issuer}</p></Td>
            <Td dataLabel="Registered">{new Date(tenant.creationTimestamp).toLocaleString()}</Td>
            <Td isActionCell><SimpleMenuActions testId={`tenant-actions-${tenant.name}`} dropdownItems={[
              {key:'edit',label:'Edit',onClick:()=>navigate(`/tenants/${encodeURIComponent(tenant.name)}/edit`)},
              {key:'delete',label:'Delete',onClick:()=>{setSelected(tenant);setDeleteError(undefined);}},
            ]} /></Td>
          </Tr></Tbody>} />}
    </PageSection>
    {selected && <DeleteModal title="Delete tenant?" deleteName={selected.name} deleting={deleting} error={deleteError}
      onClose={()=>{if(!deleting){setSelected(undefined);setDeleteError(undefined);}}} onDelete={()=>void remove()} testId="delete-tenant-modal">
      <p>Delete this tenant and its saved identity provider configuration?</p>
    </DeleteModal>}
  </ApplicationsPage>;
}
