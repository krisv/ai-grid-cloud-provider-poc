// Adapted from opendatahub-io/odh-dashboard
// packages/maas/frontend/src/app/pages/subscriptions/CreateSubscriptionPage.tsx
// upstream commit: 8051fbbea117457b4da4074fb2856b732e6677a4
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Breadcrumb, BreadcrumbItem } from '@patternfly/react-core';
import { ApplicationsPage } from '~/shared/dashboard';
import {
  getBackUrl,
  getBreadcrumbLabelFromState,
  getPreSelectedModelFromState,
} from '~/app/utilities/maasGovernanceNavigation';
import { useMaaSGovernanceContext } from '~/app/context/MaaSGovernanceContext';
import CreateSubscriptionForm from './createSubscription/CreateSubscriptionForm';

const CreateSubscriptionPage: React.FC = () => {
  const { modelRefs, loaded, error } = useMaaSGovernanceContext();
  const { state } = useLocation();
  const backUrl = getBackUrl(state, 'subscriptions');
  const returnTo = backUrl;
  const breadcrumbLabel = getBreadcrumbLabelFromState(state) ?? 'Subscriptions';
  const preSelectedModel = getPreSelectedModelFromState(state);

  return (
    <ApplicationsPage
      title="Create subscription"
      breadcrumb={
        <Breadcrumb>
          <BreadcrumbItem
            render={() => (
              <Link to={backUrl} data-testid="breadcrumb-subscriptions-link">
                {breadcrumbLabel}
              </Link>
            )}
          />
          <BreadcrumbItem isActive>Create subscription</BreadcrumbItem>
        </Breadcrumb>
      }
      loaded={loaded || !!error}
      empty={false}
      loadError={error}
    >
      <CreateSubscriptionForm
        modelRefs={modelRefs}
        returnTo={returnTo}
        preSelectedModel={preSelectedModel}
      />
    </ApplicationsPage>
  );
};

export default CreateSubscriptionPage;
