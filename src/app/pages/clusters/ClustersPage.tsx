import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, EmptyState, EmptyStateBody, Label, PageSection, SearchInput, Toolbar, ToolbarContent, ToolbarItem } from '@patternfly/react-core';
import { Tbody, Td, Tr } from '@patternfly/react-table';
import { ApplicationsPage, Table, type SortableData } from '~/shared/dashboard';
import { useServiceData } from '~/shared/hooks/useServiceData';
import { getSubscriptionService } from '~/services/subscriptions/configuredService';
import type { GridCluster } from '~/app/types/clusters';
const columns:SortableData<GridCluster>[]=[
  {label:'Cluster',field:'name',sortable:(a,b)=>a.name.localeCompare(b.name)},
  {label:'Location',field:'location',sortable:(a,b)=>(a.location ?? '').localeCompare(b.location ?? '')},
  {label:'Status',field:'status',sortable:(a,b)=>a.status.localeCompare(b.status)},
  {label:'AI Grid',field:'aiGridEnabled',sortable:(a,b)=>Number(a.aiGridEnabled)-Number(b.aiGridEnabled)},
  {label:'Provisioning',field:'provisioningStatus',sortable:(a,b)=>a.provisioningStatus.localeCompare(b.provisioningStatus)},
];
export default function ClustersPage() {
  const service=getSubscriptionService();
  const [clusters,loaded,error,refresh]=useServiceData(useCallback(()=>service.listClusters(),[service]),[]);
  const [search,setSearch]=useState('');const pending=useRef(new Set<string>());
  const [busy,setBusy]=useState<Set<string>>(()=>new Set());
  const [confirmed,setConfirmed]=useState<Set<string>>(()=>new Set());const [errors,setErrors]=useState<Record<string,string>>({});
  const [notice,setNotice]=useState<string>();
  useEffect(()=>setConfirmed(new Set()),[clusters]);
  const filtered=useMemo(()=>clusters.map(cluster=>confirmed.has(cluster.name) ? {...cluster,aiGridEnabled:true} : cluster)
    .filter(cluster=>cluster.name.toLowerCase().includes(search.toLowerCase())),[clusters,confirmed,search]);
  const reload=()=>{setConfirmed(new Set());setErrors({});refresh();};
  const enroll=async(cluster:GridCluster)=>{
    if(cluster.aiGridEnabled || pending.current.has(cluster.name))return;
    pending.current.add(cluster.name);setBusy(new Set(pending.current));setErrors(previous=>{const next={...previous};delete next[cluster.name];return next;});
    try {
      const updated=await service.enrollCluster(cluster.name);
      if(!updated.aiGridEnabled)throw new Error('The Hub did not confirm AI Grid membership. Refresh and try again.');
      setConfirmed(previous=>new Set([...previous,updated.name]));setNotice(`${updated.name} added to AI Grid`);refresh();
    } catch(err){setErrors(previous=>({...previous,[cluster.name]:err instanceof Error ? err.message : 'The cluster could not be enrolled.'}));}
    finally{pending.current.delete(cluster.name);setBusy(new Set(pending.current));}
  };
  return <ApplicationsPage title="Clusters" description="Manage AI Grid membership and provisioning readiness." loaded={loaded || !!error || clusters.length>0} empty={false}>
    <PageSection>
      {notice && <Alert isInline variant="success" title={notice} className="pf-v6-u-mb-md" />}
      {error ? <Alert isInline variant="danger" title="Error loading clusters">{error.message}<Button variant="link" onClick={reload}>Retry</Button></Alert> :
        clusters.length===0 ? <EmptyState titleText="No managed clusters" headingLevel="h2"><EmptyStateBody>No ManagedClusters are available.</EmptyStateBody><Button variant="link" onClick={reload}>Refresh</Button></EmptyState> :
          <Table data={filtered} columns={columns} actionsColumnLabel="Action" aria-label="AI Grid clusters" data-testid="clusters-table"
            toolbarContent={<Toolbar><ToolbarContent><ToolbarItem><SearchInput aria-label="Search clusters" placeholder="Search clusters by name"
              value={search} onChange={(_,value)=>setSearch(value)} onClear={()=>setSearch('')} /></ToolbarItem>
              <ToolbarItem><Button variant="secondary" onClick={reload}>Refresh</Button></ToolbarItem></ToolbarContent></Toolbar>}
            emptyTableView={<p>No clusters match your search.</p>}
            rowRenderer={cluster=><Tbody key={cluster.name}><Tr>
              <Td dataLabel="Cluster">{cluster.name}</Td>
              <Td dataLabel="Location">{cluster.location ?? '—'}</Td>
              <Td dataLabel="Status"><Label color={cluster.status==='Ready' ? 'green' : cluster.status==='Offline' ? 'red' : 'grey'}>{cluster.status}</Label></Td>
              <Td dataLabel="AI Grid">{cluster.aiGridEnabled ? 'Member' : 'Not enrolled'}</Td>
              <Td dataLabel="Provisioning"><Label color={cluster.provisioned ? 'green' : cluster.aiGridEnabled ? 'blue' : 'grey'}>{cluster.provisioningStatus}</Label></Td>
              <Td dataLabel="Action">{cluster.aiGridEnabled ? <span>AI Grid Member</span> :
                <Button variant="secondary" isDisabled={busy.has(cluster.name)} isLoading={busy.has(cluster.name)}
                  aria-label={`Add ${cluster.name} to AI Grid`} onClick={()=>void enroll(cluster)}>Add to AI Grid</Button>}
                {errors[cluster.name] && <Alert isInline variant="danger" title={`Unable to add ${cluster.name} to AI Grid`} className="pf-v6-u-mt-sm">{errors[cluster.name]}</Alert>}
              </Td>
            </Tr></Tbody>} />}
    </PageSection>
  </ApplicationsPage>;
}
