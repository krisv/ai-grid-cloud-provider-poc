// Adapted from opendatahub-io/odh-dashboard
// packages/maas/frontend/src/app/pages/subscriptions/DeleteSubscriptionModal.tsx
// upstream commit: 8051fbbea117457b4da4074fb2856b732e6677a4
import * as React from 'react';
import { Stack, StackItem } from '@patternfly/react-core';
import DeleteModal from '~/app/shared/DeleteModal';
import { MaaSSubscription } from '~/app/types/subscriptions';
import { useDeleteSubscription } from '~/app/hooks/useDeleteSubscription';

type DeleteSubscriptionModalProps = {
  subscription: MaaSSubscription;
  onClose: (deleted?: boolean) => void;
};

const DeleteSubscriptionModal: React.FC<DeleteSubscriptionModalProps> = ({
  subscription,
  onClose,
}) => {
  const { isDeleting, error, deleteSubscriptionCallback } = useDeleteSubscription();
  if (!subscription.name) {
    return null;
  }

  return (
    <DeleteModal
      title="Delete subscription?"
      onClose={() => {
        onClose();
      }}
      deleting={isDeleting}
      onDelete={async () => {
        const deleted = await deleteSubscriptionCallback(subscription.name, subscription.revision ?? '');
        if (deleted) onClose(true);
      }}
      submitButtonLabel="Delete"
      deleteName={subscription.displayName || subscription.name}
      error={error}
      genericLabel
      testId="delete-subscription-modal"
    >
      <Stack hasGutter>
        <StackItem data-testid="delete-modal-confirmation-message">
          Are you sure you want to delete the subscription{' '}
          <strong>{subscription.displayName || subscription.name}</strong>?
        </StackItem>
        <StackItem>The automatically created authorization policy will also be deleted.</StackItem>
      </Stack>
    </DeleteModal>
  );
};

export default DeleteSubscriptionModal;
