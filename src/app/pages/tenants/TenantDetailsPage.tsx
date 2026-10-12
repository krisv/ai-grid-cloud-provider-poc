import { useCallback } from 'react';
import { Breadcrumb, BreadcrumbItem, Button, Label, PageSection } from '@patternfly/react-core';
import { Link, useParams } from 'react-router-dom';
import { ApplicationsPage } from '~/shared/dashboard';
import { useServiceData } from '~/shared/hooks/useServiceData';
import { getSubscriptionService } from '~/services/subscriptions/configuredService';
import TenantConfigurationDetails from './TenantConfigurationDetails';
export default function TenantDetailsPage() {
  const {tenantName=''}=useParams();const service=getSubscriptionService();
  const [tenant,loaded,error]=useServiceData(useCallback(()=>service.getTenant(tenantName),[service,tenantName]),undefined,0);
  return <ApplicationsPage title={tenant?.name ?? 'Tenant'} loaded={loaded} loadError={error} errorMessage="Error loading tenant" empty={false}
    breadcrumb={<Breadcrumb><BreadcrumbItem><Link to="/tenants">Tenants</Link></BreadcrumbItem><BreadcrumbItem isActive>{tenantName}</BreadcrumbItem></Breadcrumb>}>
    {tenant && <PageSection><div className="portal-page-heading"><Label color="blue">Saved</Label>
      <Button component={props=><Link {...props} to={`/tenants/${encodeURIComponent(tenantName)}/edit`} />}>Edit tenant</Button></div>
      <TenantConfigurationDetails tenant={tenant} />
    </PageSection>}
  </ApplicationsPage>;
}
