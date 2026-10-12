// Adapted from packages/model-serving/src/components/deployments/DeploymentsTable.tsx
// and components/global/GlobalDeploymentsView.tsx.
// upstream commit: 8051fbbea117457b4da4074fb2856b732e6677a4
import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, EmptyState, EmptyStateActions, EmptyStateBody, EmptyStateFooter, Label,
  PageSection, SearchInput, Toolbar, ToolbarContent, ToolbarItem } from '@patternfly/react-core';
import { ExpandableRowContent, Tbody, Td, Tr } from '@patternfly/react-table';
import { ApplicationsPage, Table, type SortableData } from '~/shared/dashboard';
import SimpleMenuActions from '~/shared/components/SimpleMenuActions';
import DeleteModal from '~/app/shared/DeleteModal';
import { useServiceData } from '~/shared/hooks/useServiceData';
import { getSubscriptionService } from '~/services/subscriptions/configuredService';
import { useMaaSGovernanceContext } from '~/app/context/MaaSGovernanceContext';
import type { ManagedModel } from '~/app/types/models';
import CompoundExpandCountCell from '~/app/shared/CompoundExpandCountCell';
import ExpandedLocationsPanel from './ExpandedLocationsPanel';
const columns:SortableData<ManagedModel>[]=[
  {label:'Model deployment name',field:'name',sortable:(a,b)=>(a.displayName ?? a.name).localeCompare(b.displayName ?? b.name)},
  {label:'Model',field:'modelName',sortable:(a,b)=>(a.modelName ?? a.modelRef.name).localeCompare(b.modelName ?? b.modelRef.name)},
  {label:'Replica count',field:'replicas',sortable:(a,b)=>(a.replicas ?? 0)-(b.replicas ?? 0)},
  {label:'Locations',field:'locations',sortable:(a,b)=>a.locations.length-b.locations.length},
  {label:'Last saved',field:'creationTimestamp',sortable:(a,b)=>(a.creationTimestamp ?? '').localeCompare(b.creationTimestamp ?? '')},
  {label:'Status',field:'status',sortable:(a,b)=>(a.status ?? '').localeCompare(b.status ?? '')},
];
export default function ModelsPage() {
  const service=getSubscriptionService();const {refresh:refreshCatalog}=useMaaSGovernanceContext();
  const [deployments,loaded,error,refresh]=useServiceData(useCallback(()=>service.listModels(),[service]),[]);
  const [filter,setFilter]=useState('');const [selected,setSelected]=useState<ManagedModel>();
  const [deleting,setDeleting]=useState(false);const [deleteError,setDeleteError]=useState<Error>();
  const [expandedLocations,setExpandedLocations]=useState<Set<string>>(()=>new Set());
  const toggleLocations=(key:string)=>setExpandedLocations(previous=>{
    const next=new Set(previous);if(next.has(key))next.delete(key);else next.add(key);return next;
  });
  const filtered=useMemo(()=>deployments.filter(d=>`${d.displayName ?? ''} ${d.name} ${d.modelName} ${d.locations.join(' ')}`.toLowerCase().includes(filter.toLowerCase())),[deployments,filter]);
  const closeDelete=()=>{if(!deleting){setSelected(undefined);setDeleteError(undefined);}};
  const remove=async()=>{
    if(!selected || deleting)return;
    setDeleting(true);setDeleteError(undefined);
    try {await service.deleteModel(selected.name,selected.revision);setSelected(undefined);refresh();refreshCatalog();}
    catch(err){setDeleteError(err instanceof Error ? err : new Error('The deployment could not be deleted.'));}
    finally{setDeleting(false);}
  };
  const deployButton=<Button component={(props)=><Link {...props} to="/models/deploy" />}>Deploy model</Button>;
  return <ApplicationsPage title="Models" description="Add and remove model deployments saved to Git."
    loaded={loaded || !!error} empty={false}>
    <PageSection>
      {error ? <Alert isInline variant="danger" title="Error loading models">{error.message}<Button variant="link" onClick={refresh}>Retry</Button></Alert> :
        deployments.length===0 ? <EmptyState titleText="No models" headingLevel="h2">
          <EmptyStateBody>Add a deployment to configure a model for serving.</EmptyStateBody>
          <EmptyStateFooter><EmptyStateActions>{deployButton}</EmptyStateActions></EmptyStateFooter>
        </EmptyState> : <Table data={filtered} columns={columns} aria-label="Model deployments" data-testid="model-deployments-table"
          disableRowRenderSupport isExpandable
          toolbarContent={<Toolbar><ToolbarContent><ToolbarItem><SearchInput aria-label="Filter models" placeholder="Filter by name or location"
            value={filter} onChange={(_,value)=>setFilter(value)} onClear={()=>setFilter('')} /></ToolbarItem><ToolbarItem>{deployButton}</ToolbarItem></ToolbarContent></Toolbar>}
          emptyTableView={<><p>No models match the filter.</p><Button variant="link" onClick={()=>setFilter('')}>Clear filter</Button></>}
          rowRenderer={(deployment,rowIndex)=>{
            const key=deployment.name;const isExpanded=expandedLocations.has(key);
            return <Tbody key={key} isExpanded={isExpanded}><Tr isControlRow isContentExpanded={isExpanded}>
            <Td dataLabel="Model deployment name"><strong>{deployment.displayName ?? deployment.name}</strong><p>{deployment.description}</p>
              </Td>
            <Td dataLabel="Model">{deployment.modelName ?? deployment.modelRef.name}</Td><Td dataLabel="Replica count">{deployment.replicas ?? '—'}</Td>
            <Td dataLabel="Locations" data-testid={`model-locations-expand-${deployment.name}`}
              compoundExpand={{isExpanded,onToggle:()=>toggleLocations(key),expandId:`expand-${deployment.name}-locations`,rowIndex,columnIndex:3}}>
              <CompoundExpandCountCell count={deployment.locations.length} />
            </Td>
            <Td dataLabel="Last saved">{deployment.creationTimestamp ? new Date(deployment.creationTimestamp).toLocaleString() : '—'}</Td>
            <Td dataLabel="Status"><Label color="blue">{deployment.status==='Saved' ? 'Saved' : deployment.hasDeployment ? 'Saved to Git' : 'Registered'}</Label></Td>
            <Td isActionCell><SimpleMenuActions testId={`model-actions-${deployment.name}`} dropdownItems={[{key:'delete',label:'Delete',onClick:()=>{setSelected(deployment);setDeleteError(undefined);}}]} /></Td>
          </Tr><Tr isExpanded={isExpanded}><Td colSpan={columns.length+1}>
            <ExpandableRowContent><ExpandedLocationsPanel locations={deployment.locations} /></ExpandableRowContent>
          </Td></Tr></Tbody>;
          }} />}
    </PageSection>
    {selected && <DeleteModal title="Delete model deployment?" deleteName={selected.displayName ?? selected.name}
      onClose={closeDelete} onDelete={()=>void remove()} deleting={deleting} error={deleteError} testId="delete-deployment-modal">
      <p>Delete this model, its saved deployment, and its location placement resources? Remove references from subscriptions and authorization policies first.</p>
    </DeleteModal>}
  </ApplicationsPage>;
}
