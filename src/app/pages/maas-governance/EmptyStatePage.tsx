// Adapted from opendatahub-io/odh-dashboard
// packages/maas/frontend/src/app/pages/maas-governance/EmptyStatePage.tsx
// upstream commit: 8051fbbea117457b4da4074fb2856b732e6677a4
import * as React from 'react';
import {
  Button,
  EmptyState,
  EmptyStateBody,
  EmptyStateFooter,
  EmptyStateActions,
} from '@patternfly/react-core';
import { Link } from 'react-router-dom';
import { CubesIcon, PlusCircleIcon } from '@patternfly/react-icons';
import {
  getAuthPolicyCreateUrl,
  getSubscriptionCreateUrl,
} from '~/app/utilities/maasGovernanceNavigation';

type EmptyStatePageProps = {
  title?: string;
  cubeIcon?: boolean;
  bodyText?: string;
  returnTo?: string;
  showSubsButton?: boolean;
  showPoliciesButton?: boolean;
  testId?: string;
};

const EmptyStatePage: React.FC<EmptyStatePageProps> = ({
  title,
  cubeIcon = false,
  bodyText,
  returnTo,
  showSubsButton = false,
  showPoliciesButton = false,
  testId,
}) => {
  const navState = returnTo ? { returnTo } : undefined;

  return (
    <>
      <EmptyState
        titleText={title}
        headingLevel="h3"
        variant="lg"
        data-testid={testId}
        icon={cubeIcon ? CubesIcon : PlusCircleIcon}
      >
        <EmptyStateBody>{bodyText}</EmptyStateBody>
        <EmptyStateFooter>
          <EmptyStateActions>
            {showSubsButton && (
              <Button
                variant="primary"
                component={(props) => (
                  <Link {...props} to={getSubscriptionCreateUrl()} state={navState} />
                )}
                data-testid="create-subscription-button"
              >
                Create subscription
              </Button>
            )}
            {showPoliciesButton && (
              <Button
                variant="primary"
                component={(props) => (
                  <Link {...props} to={getAuthPolicyCreateUrl()} state={navState} />
                )}
                data-testid="create-auth-policy-button"
              >
                Create authorization policy
              </Button>
            )}
          </EmptyStateActions>
        </EmptyStateFooter>
      </EmptyState>
    </>
  );
};

export default EmptyStatePage;
