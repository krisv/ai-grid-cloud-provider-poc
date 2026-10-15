import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Label, PageSection, Title, ToggleGroup, ToggleGroupItem } from '@patternfly/react-core';
import { Link } from 'react-router-dom';
import { getSubscriptionService } from '~/services/subscriptions/configuredService';
import type { GridOverview } from '~/services/subscriptions/SubscriptionService';
import type { Tenant } from '~/app/types/tenants';
import type { ManagedModel } from '~/app/types/models';
import ObservabilityPanel from './ObservabilityPanel';
import GridFleetView from './GridFleetView';
type Metric=GridOverview['metrics'][number];
export default function GridPage({monitoring=false}:{monitoring?:boolean}) {
  const service=getSubscriptionService();const [range,setRange]=useState('1h');
  const [data,setData]=useState<GridOverview>(),[metrics,setMetrics]=useState<Metric[]>([]),[error,setError]=useState<string>(),[loading,setLoading]=useState(true),[refresh,setRefresh]=useState(0);
  const [metricsLoading,setMetricsLoading]=useState(false),[metricsSource,setMetricsSource]=useState<'thanos'|'demo'>('thanos');
  const [metricsError,setMetricsError]=useState<string>();
  const [tenants,setTenants]=useState<Tenant[]>([]),[tenantsError,setTenantsError]=useState<string>();
  useEffect(()=>{let active=true;if(!monitoring)return;setTenantsError(undefined);service.listTenants().then(value=>{if(active)setTenants(value);}).catch(()=>{if(active){setTenants([]);setTenantsError('Unable to load tenant identities.');}});return ()=>{active=false;};},[service,monitoring,refresh]);
  const [models,setModels]=useState<ManagedModel[]>([]),[modelsError,setModelsError]=useState<string>();
  useEffect(()=>{let active=true;setModelsError(undefined);service.listModels().then(value=>{if(active)setModels(value);}).catch(e=>{if(active){setModels([]);setModelsError(e instanceof Error ? e.message : 'Unable to load models.');}});return ()=>{active=false;};},[service,refresh]);
  const load=useCallback(()=>service.getGridOverview('1h',undefined,false),[service]);
  useEffect(()=>{let active=true;setLoading(true);setError(undefined);load().then(value=>{if(active)setData(value);}).catch(e=>{if(active){setData(undefined);setError(e instanceof Error ? e.message : 'Unable to load AI Grid.');}}).finally(()=>{if(active)setLoading(false);});return ()=>{active=false;};},[load,refresh]);
  useEffect(()=>{
    let active=true;setMetrics([]);if(!monitoring)return;
    setMetricsLoading(true);
    service.getGridOverview(range).then(value=>{
      if(active){setMetrics(value.metrics);setMetricsSource(value.metricsSource);}
    }).catch(()=>{if(active)setMetricsError('Unable to load metrics for this selection. Please retry.');})
      .finally(()=>{if(active)setMetricsLoading(false);});
    setMetricsError(undefined);
    return ()=>{active=false;};
  },[service,range,monitoring,refresh]);
  const clusters=data?.clusters ?? [];
  return <>{monitoring && <PageSection><div className="observability-header"><div><Title headingLevel="h1" size="3xl">Observability dashboard</Title><p>Monitor cluster availability, gateway performance, and infrastructure resource usage.</p></div><div className="observability-time-controls"><span>Time period:</span><ToggleGroup aria-label="Time range" isCompact>{['1h','6h','24h'].map(r=><ToggleGroupItem key={r} text={`Last ${r}`} buttonId={`obs-range-${r}`} isSelected={range===r} onChange={()=>setRange(r)}/>)}</ToggleGroup></div></div></PageSection>}
    <PageSection>
      <div className="grid-toolbar">{!monitoring && <Label color="grey">AI Grid</Label>}

        <Button variant="secondary" onClick={()=>setRefresh(n=>n+1)} isDisabled={loading}>Refresh</Button><Link to={monitoring ? '/ai-grid' : '/monitoring'}>{monitoring ? 'View AI Grid' : 'View monitoring'}</Link></div>
      {error && <Alert isInline variant="danger" title="Unable to load AI Grid">{error}</Alert>}
      {loading && <p role="status">Loading AI Grid…</p>}
      {data && <>{data.demo && <Alert isInline variant="info" title="Demo data">{monitoring ? 'Inventory and metrics on this page are simulated.' : 'Inventory on this page is simulated.'}</Alert>}
        {monitoring && !data.demo && metricsSource==='demo' && <Alert isInline variant="info" title="Simulated monitoring metrics">Thanos is not configured. Charts show generated demo data; cluster inventory comes from the configured backend.</Alert>}
        <p className="grid-source">Inventory: {data.inventorySource.toUpperCase()} · Retrieved {new Date(data.updatedAt).toLocaleString()}{monitoring && <> · Metrics: {metricsSource==='demo' || data.demo ? 'Demo' : 'Thanos'}</>}</p>
        {!monitoring && <GridFleetView clusters={clusters} models={models} modelsError={modelsError}/>}
        {monitoring && <ObservabilityPanel clusters={clusters} models={models} modelsError={modelsError} tenants={tenants} tenantsError={tenantsError} metrics={metrics} loading={metricsLoading} error={metricsError} simulated={metricsSource==='demo'} range={range}/>}

      </>}
    </PageSection></>;
}
