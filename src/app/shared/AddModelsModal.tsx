// Adapted from opendatahub-io/odh-dashboard
// packages/maas/frontend/src/app/shared/AddModelsModal.tsx
// upstream commit: 8051fbbea117457b4da4074fb2856b732e6677a4
import React from 'react';
import {
  Button,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  SearchInput,
  Stack,
  StackItem,
} from '@patternfly/react-core';
import { Table, Thead, Tr, Th, Tbody, Td, ThProps } from '@patternfly/react-table';
import {
  MaaSModelRefSummary,
  SubscriptionModelEntry,
} from '~/app/types/subscriptions';

export type AddModelsModalProps = {
  availableModelRefs: MaaSModelRefSummary[];
  currentModels: Pick<SubscriptionModelEntry, 'modelRefSummary'>[];
  onAdd: (refs: MaaSModelRefSummary[]) => void;
  onRemove: (refs: MaaSModelRefSummary[]) => void;
  onClose: () => void;
  ariaLabel?: string;
  title?: string;
  description?: React.ReactNode;
};

type SortColumn = 'name';

const modelRefKey = (name: string): string => name;

const defaultDescription = (
  <>
    Select models to make available to members of this subscription, then set token limits for each
    one.
  </>
);

const AddModelsModal: React.FC<AddModelsModalProps> = ({
  availableModelRefs,
  currentModels,
  onAdd,
  onRemove,
  onClose,
  ariaLabel = 'Add models',
  title = 'Add models',
  description = defaultDescription,
}) => {

  const [filter, setFilter] = React.useState('');
  const [sortColumn, setSortColumn] = React.useState<SortColumn>('name');
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('asc');
  const [pendingAdds, setPendingAdds] = React.useState<Set<string>>(new Set());
  const [pendingRemoves, setPendingRemoves] = React.useState<Set<string>>(new Set());

  const currentModelKeys = React.useMemo(
    () =>
      new Set(
        currentModels.map((m) => modelRefKey(m.modelRefSummary.name)),
      ),
    [currentModels],
  );

  const isInCurrentSelection = (ref: MaaSModelRefSummary) => {
    const key = modelRefKey(ref.name);
    return (currentModelKeys.has(key) && !pendingRemoves.has(key)) || pendingAdds.has(key);
  };

  const filteredModels = React.useMemo(() => {
    const lowerFilter = filter.toLowerCase();
    const filtered = lowerFilter
      ? availableModelRefs.filter(ref => (ref.displayName ?? ref.name).toLowerCase().includes(lowerFilter))
      : [...availableModelRefs];

    return filtered.toSorted((a, b) => {
      let valA: string;
      let valB: string;
      switch (sortColumn) {
        case 'name':
          valA = a.displayName ?? a.name;
          valB = b.displayName ?? b.name;
          break;
        default:
          valA = a.name;
          valB = b.name;
      }
      const cmp = valA.localeCompare(valB);
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [availableModelRefs, filter, sortColumn, sortDirection]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortColumnIndex: Record<SortColumn, number> = { name: 0 };

  const getSortParams = (column: SortColumn): ThProps['sort'] => ({
    sortBy: {
      index: sortColumnIndex[sortColumn],
      direction: sortDirection,
    },
    onSort: () => handleSort(column),
    columnIndex: sortColumnIndex[column],
  });

  const handleToggleModel = (ref: MaaSModelRefSummary) => {
    const key = modelRefKey(ref.name);
    if (currentModelKeys.has(key)) {
      setPendingRemoves((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
    } else {
      setPendingAdds((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
    }
  };

  const handleConfirm = () => {
    const refsToAdd = availableModelRefs.filter((ref) =>
      pendingAdds.has(modelRefKey(ref.name)),
    );
    const refsToRemove = currentModels
      .filter((m) =>
        pendingRemoves.has(modelRefKey(m.modelRefSummary.name)),
      )
      .map((m) => m.modelRefSummary);
    if (refsToRemove.length > 0) {
      onRemove(refsToRemove);
    }
    if (refsToAdd.length > 0) {
      onAdd(refsToAdd);
    }
    onClose();
  };


  return (
    <Modal
      isOpen
      onClose={onClose}
      variant="large"
      aria-label={ariaLabel}
      data-testid="add-models-modal"
    >
      <ModalHeader title={title} />
      <ModalBody>
        <Stack hasGutter>
          <StackItem>{description}</StackItem>
          <StackItem>
            <SearchInput
              placeholder="Filter by model name"
              value={filter}
              onChange={(_e, val) => setFilter(val)}
              onClear={() => setFilter('')}
              data-testid="add-models-filter"
            />
          </StackItem>
          <StackItem>
            <Table aria-label="Available models" data-testid="add-models-table">
              <Thead>
                <Tr>
                  <Th sort={getSortParams('name')}>Model name</Th>
                  <Th screenReaderText="Actions" />
                </Tr>
              </Thead>
              <Tbody>
                {filteredModels.map((ref) => {
                  const key = modelRefKey(ref.name);
                  const selected = isInCurrentSelection(ref);

                  return (
                    <Tr key={key}>
                      <Td dataLabel="Model name">
                        <strong>{ref.displayName ?? ref.name}</strong>
                      </Td>
                      <Td isActionCell style={{ textAlign: 'center' }}>
                        <Button
                          variant={selected ? 'secondary' : 'link'}
                          size={selected ? 'sm' : 'default'}
                          isDanger={selected}
                          onClick={() => handleToggleModel(ref)}
                          data-testid={`toggle-model-${ref.name}`}
                        >
                          {selected ? 'Remove model' : 'Add model'}
                        </Button>
                      </Td>
                    </Tr>
                  );
                })}
                {filteredModels.length === 0 && (
                  <Tr>
                    <Td colSpan={2}>No models match the filter criteria.</Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          </StackItem>
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={handleConfirm} data-testid="confirm-add-models">
          Add models
        </Button>
        <Button variant="link" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default AddModelsModal;
