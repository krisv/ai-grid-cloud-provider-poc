import { useCallback } from 'react';
import { Breadcrumb, BreadcrumbItem, PageSection } from '@patternfly/react-core';
import { Link, useParams } from 'react-router-dom';
import { ApplicationsPage } from '~/shared/dashboard';
import { useServiceData } from '~/shared/hooks/useServiceData';
import { getSubscriptionService } from '~/services/subscriptions/configuredService';
import TenantFormWizard from './TenantFormWizard';
export default function TenantWizardPage() {
  const {tenantName}=useParams();const service=getSubscriptionService();
  const [tenant,loaded,error]=useServiceData(useCallback(()=>tenantName ? service.getTenant(tenantName) : Promise.resolve(undefined),[service,tenantName]),undefined,0);
  const title=tenantName ? 'Edit tenant' : 'Create tenant';
  return <ApplicationsPage title={title} description="Configure tenant details and an OIDC identity provider."
    loaded={loaded} loadError={error} errorMessage="Error loading tenant" empty={false}
    breadcrumb={<Breadcrumb><BreadcrumbItem><Link to="/tenants">Tenants</Link></BreadcrumbItem><BreadcrumbItem isActive>{title}</BreadcrumbItem></Breadcrumb>}>
    <PageSection hasBodyWrapper={false}>{loaded && !error && <TenantFormWizard key={tenantName ?? 'create'} initial={tenant} />}</PageSection>
  </ApplicationsPage>;
}
