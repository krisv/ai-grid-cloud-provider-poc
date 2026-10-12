// Adapted from opendatahub-io/odh-dashboard
// packages/maas/frontend/src/app/pages/subscriptions/allSubscriptions/SubscriptionsTable.tsx
// upstream commit: 8051fbbea117457b4da4074fb2856b732e6677a4
import * as React from 'react';
import { Table, DashboardEmptyTableView } from '~/shared/dashboard';
import { MaaSSubscription } from '~/app/types/subscriptions';
import { subscriptionsColumns } from './columns';
import SubscriptionTableRow from './SubscriptionTableRow';

type SubscriptionTableProps = {
  subscriptions: MaaSSubscription[];
  toolbarContent?: React.ReactElement;
  onClearFilters: () => void;
  setDeleteSubscription: (subscription: MaaSSubscription) => void;
  returnTo?: string;
};

export const SubscriptionsTable: React.FC<SubscriptionTableProps> = ({
  subscriptions,
  toolbarContent,
  onClearFilters,
  setDeleteSubscription,
  returnTo,
}): React.ReactNode => (
  <Table
    data-testid="subscriptions-table"
    data={subscriptions}
    columns={subscriptionsColumns}
    enablePagination
    disableRowRenderSupport
    isExpandable
    rowRenderer={(subscription: MaaSSubscription, rowIndex: number) => (
      <SubscriptionTableRow
        key={subscription.name}
        subscription={subscription}
        rowIndex={rowIndex}
        setDeleteSubscription={setDeleteSubscription}
        returnTo={returnTo}
      />
    )}
    emptyTableView={<DashboardEmptyTableView onClearFilters={onClearFilters} />}
    toolbarContent={toolbarContent}
    onClearFilters={onClearFilters}
  />
);
