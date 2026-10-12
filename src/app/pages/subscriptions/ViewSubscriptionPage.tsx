// Adapted from opendatahub-io/odh-dashboard
// packages/maas/frontend/src/app/pages/subscriptions/ViewSubscriptionPage.tsx
// upstream commit: 8051fbbea117457b4da4074fb2856b732e6677a4
import * as React from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ApplicationsPage, TrackingOutcome } from '~/shared/dashboard';
import {
  Breadcrumb,
  BreadcrumbItem,
  PageSection,
  Tab,
  Tabs,
  TabTitleText,
} from '@patternfly/react-core';
import SimpleMenuActions from '~/shared/components/SimpleMenuActions';
import {
  fireFormTrackingEvent,
} from '~/shared/telemetry';
import { useMaaSGovernanceContext } from '~/app/context/MaaSGovernanceContext';
import { useGetSubscriptionInfo } from '~/app/hooks/useGetSubscriptionInfo';
import {
  MaaSModelRefSummary,
  MaaSSubscription,
  SubscriptionInfoResponse,
} from '~/app/types/subscriptions';
import {
  getBackUrl,
  getBreadcrumbLabelFromState,
  getSectionUrl,
  getSubscriptionEditUrl,
} from '~/app/utilities/maasGovernanceNavigation';
import MaasModelsSection from '~/app/shared/MaasModelsSection';
import { modelRefsToSummaries } from '~/app/utilities/authpolicies';
import {
  EventTrackingResourceType,
  EventTrackingSource,
  EventTrackingEditSource,
  MaaSEvents,
  MaaSResourceDeletedProperties,
} from '~/app/types/event-tracking';
import DeleteSubscriptionModal from './DeleteSubscriptionModal';
import SubscriptionDetailsSection from './viewSubscription/SubscriptionDetailsSection';
import SubscriptionGroupsSection from './viewSubscription/SubscriptionGroupsSection';

type SubscriptionActionsProps = {
  subscription: MaaSSubscription;
  returnTo?: string;
};

const SubscriptionActions: React.FC<SubscriptionActionsProps> = ({ subscription, returnTo }) => {
  const navigate = useNavigate();
  const { refresh } = useMaaSGovernanceContext();
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const backUrl = returnTo ?? getSectionUrl('subscriptions');
  const navState = {
    state: {
      ...(returnTo ? { returnTo } : {}),
      editSource: EventTrackingEditSource.DETAIL_KEBAB,
    },
  };

  return (
    <>
      <SimpleMenuActions
        testId="subscription-actions-toggle"
        dropdownItems={[
          {
            key: 'edit',
            label: 'Edit',
            onClick: () => navigate(getSubscriptionEditUrl(subscription.name), navState),
            isDisabled: !!subscription.deletionTimestamp,
          },
          { isSpacer: true },
          {
            key: 'delete',
            label: 'Delete',
            onClick: () => setIsDeleteOpen(true),
            isDisabled: !!subscription.deletionTimestamp,
          },
        ]}
      />
      {isDeleteOpen && (
        <DeleteSubscriptionModal
          subscription={subscription}
          onClose={(deleted) => {
            setIsDeleteOpen(false);
            if (deleted) {
              refresh();
              fireFormTrackingEvent(MaaSEvents.MAAS_RESOURCE_DELETED, {
                resourceType: EventTrackingResourceType.SUBSCRIPTION,
                source: EventTrackingSource.DETAIL_KEBAB,
                resourceStatus: subscription.phase ?? '',
                outcome: TrackingOutcome.submit,
              } satisfies MaaSResourceDeletedProperties);
              navigate(backUrl, { state: { notice: 'Subscription deleted' } });
            } else {
              fireFormTrackingEvent(MaaSEvents.MAAS_RESOURCE_DELETED, {
                resourceType: EventTrackingResourceType.SUBSCRIPTION,
                source: EventTrackingSource.DETAIL_KEBAB,
                resourceStatus: subscription.phase ?? '',
                outcome: TrackingOutcome.cancel,
              } satisfies MaaSResourceDeletedProperties);
            }
          }}
        />
      )}
    </>
  );
};

const viewModelRefSummaries = (info: SubscriptionInfoResponse): MaaSModelRefSummary[] =>
  modelRefsToSummaries(
    Array.isArray(info.subscription.modelRefs) ? info.subscription.modelRefs : [],
    Array.isArray(info.modelRefs) ? info.modelRefs : [],
  );

const ViewSubscriptionPage: React.FC = () => {
  const { subscriptionName = '' } = useParams<{ subscriptionName: string }>();
  const location = useLocation();
  const [subscriptionInfo, loaded, loadError] = useGetSubscriptionInfo(subscriptionName);
  const displaySubscriptionName =
    subscriptionInfo?.subscription.displayName?.trim() || subscriptionName;

  const backUrl = getBackUrl(location.state, 'subscriptions');
  const breadcrumbLabel = getBreadcrumbLabelFromState(location.state) ?? 'Subscriptions';

  const breadcrumb = (
    <Breadcrumb>
      <BreadcrumbItem>
        <Link to={backUrl} data-testid="breadcrumb-subscriptions-link">
          {breadcrumbLabel}
        </Link>
      </BreadcrumbItem>
      <BreadcrumbItem isActive>{displaySubscriptionName}</BreadcrumbItem>
    </Breadcrumb>
  );

  return (
    <ApplicationsPage
      title={displaySubscriptionName}
      breadcrumb={breadcrumb}
      headerAction={
        subscriptionInfo && (
          <SubscriptionActions subscription={subscriptionInfo.subscription} returnTo={backUrl} />
        )
      }
      empty={false}
      loaded={loaded || !!loadError}
      loadError={loadError}
      errorMessage="Unable to load subscription details."
    >
      {loaded && subscriptionInfo && (
        <Tabs
          activeKey="details"
          aria-label="Subscription detail tabs"
          inset={{ default: 'insetNone' }}

        >
          <Tab
            eventKey="details"
            title={<TabTitleText>Details</TabTitleText>}
            aria-label="Subscription details tab"
            data-testid="subscription-details-tab"
          >
            <PageSection hasBodyWrapper={false} className="pf-v6-u-pb-xl">
              <SubscriptionDetailsSection
                subscription={subscriptionInfo.subscription}
                modelRefs={viewModelRefSummaries(subscriptionInfo)}
              />
            </PageSection>
            <PageSection hasBodyWrapper={false} className="pf-v6-u-pb-xl">
              <SubscriptionGroupsSection groups={subscriptionInfo.subscription.owner.groups} />
            </PageSection>
            <PageSection hasBodyWrapper={false} className="pf-v6-u-pb-xl">
              <MaasModelsSection
                modelRefSummaries={viewModelRefSummaries(subscriptionInfo)}
                modelRefsWithRateLimits={subscriptionInfo.subscription.modelRefs}
                resourceType="subscription"
              />
            </PageSection>
          </Tab>
        </Tabs>
      )}
    </ApplicationsPage>
  );
};

export default ViewSubscriptionPage;
