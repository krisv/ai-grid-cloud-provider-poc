// Adapted from opendatahub-io/odh-dashboard
// packages/maas/frontend/src/app/pages/subscriptions/createSubscription/CreateSubscriptionForm.tsx
// upstream commit: 8051fbbea117457b4da4074fb2856b732e6677a4
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ActionGroup,
  Alert,
  Button,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  NumberInput,
  PageSection,
} from '@patternfly/react-core';
import { MultiSelection, SelectionOptions } from '~/shared/components/MultiSelection';
import K8sNameDescriptionField, {
  useK8sNameDescriptionFieldData,
} from '~/shared/components/K8sNameDescriptionField/K8sNameDescriptionField';
import { isK8sNameDescriptionDataValid } from '~/shared/utilities/nameField';
import { useZodFormValidation } from '~/shared/hooks/useZodFormValidation';
import { APIOptions } from '~/shared/api';
import { z } from 'zod';
import { fireFormTrackingEvent } from '~/shared/telemetry';
import { TrackingOutcome } from '~/shared/dashboard';
import { getSectionUrl } from '~/app/utilities/maasGovernanceNavigation';
import { createSubscription, updateSubscription } from '~/app/api/subscriptions';
import { useMaaSGovernanceContext } from '~/app/context/MaaSGovernanceContext';
import { useSubscriptionModels } from '~/app/hooks/useSubscriptionModels';
import {
  MaaSModelRefSummary,
  MaaSSubscription,
  SubscriptionInfoResponse,
  SubscriptionModelEntry,
  CreateSubscriptionRequest,
  UpdateSubscriptionRequest,
  SYSTEM_AUTHENTICATED_GROUP,
} from '~/app/types/subscriptions';
import AddModelsModal from '~/app/shared/AddModelsModal';
import MaasModelsSection from '~/app/shared/MaasModelsSection';
import {
  EventTrackingEditSource,
  EventTrackingPrefillSource,
  MaaSEvents,
  SubscriptionCreatedCancelProperties,
  SubscriptionCreatedErrorProperties,
  SubscriptionCreatedSuccessProperties,
  SubscriptionUpdatedCancelProperties,
  SubscriptionUpdatedErrorProperties,
  SubscriptionUpdatedSuccessProperties,
} from '~/app/types/event-tracking';
import SystemAuthenticatedWarning from '~/app/shared/SystemAuthenticatedWarning';
import EditRateLimitsModal from './EditRateLimitsModal';

type CreateSubscriptionFormProps = {
  modelRefs: MaaSModelRefSummary[];
  subscriptionInfo?: SubscriptionInfoResponse;
  returnTo?: string;
  preSelectedModel?: { name: string };
  editSource?: EventTrackingEditSource;
};
const MAX_PRIORITY = 1000000;
const MIN_PRIORITY = -1000000;

const subscriptionFormSchema = z.object({
  priority: z
    .number({ message: 'Priority is required' })
    .int('Priority must be a whole number')
    .min(MIN_PRIORITY, `Priority must be at least ${MIN_PRIORITY}`)
    .max(MAX_PRIORITY, `Priority must be at most ${MAX_PRIORITY}`),
  groups: z.array(z.string()).min(1, 'One or more groups must be selected'),
  models: z.array(z.unknown()).min(1, 'One or more models must be added'),
});

type SubscriptionFormData = z.infer<typeof subscriptionFormSchema>;

const buildInitialModels = (info: SubscriptionInfoResponse): SubscriptionModelEntry[] =>
  info.subscription.modelRefs.map((ref) => {
    const summary = info.modelRefs.find(
      (s) => s.name === ref.name,
    );
    return {
      modelRefSummary: summary ?? {
        name: ref.name,

        modelRef: { kind: '', name: '' },
      },
      tokenRateLimits: ref.tokenRateLimits,
      unlimited: ref.unlimited,
    };
  });

const CreateSubscriptionForm: React.FC<CreateSubscriptionFormProps> = ({
  modelRefs,
  subscriptionInfo,
  returnTo,
  preSelectedModel,
  editSource,
}) => {
  const navigate = useNavigate();
  const { refresh } = useMaaSGovernanceContext();
  const isEditing = !!subscriptionInfo;
  const subscription = subscriptionInfo?.subscription;

  const { data: nameDescData, onDataChange: onNameDescChange } = useK8sNameDescriptionFieldData(
    subscription
      ? {
          initialData: {
            name: subscription.displayName ?? subscription.name,
            k8sName: subscription.name,
            description: subscription.description ?? '',
          },
        }
      : undefined,
  );

  const [selectedGroups, setSelectedGroups] = React.useState<SelectionOptions[]>(() => {
    return (subscription?.owner.groups ?? []).map(({name}) => ({
      id: name,
      name,
      selected: true,
    }));
  });
  const [groupsTouched, setGroupsTouched] = React.useState(false);
  const [modelsTouched, setModelsTouched] = React.useState(false);
  const [priority, setPriority] = React.useState<number | undefined>(subscription?.priority ?? 0);
  const createAuthPolicy = true;
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const [initialModels] = React.useState<SubscriptionModelEntry[]>(() => {
    if (subscriptionInfo) {
      return buildInitialModels(subscriptionInfo);
    }
    if (preSelectedModel) {
      const match = modelRefs.find(
        (m) =>
          m.name === preSelectedModel.name,
      );
      if (match) {
        return [{ modelRefSummary: match, tokenRateLimits: [] }];
      }
    }
    return [];
  });

  const {
    models,
    isAddModelsModalOpen,
    setIsAddModelsModalOpen,
    editLimitsTarget,
    setEditLimitsTarget,
    editingModel,
    allModelsHaveRateLimits,
    handleAddModels,
    handleRemoveModel,
    handleRemoveModelsByRef,
    handleSaveRateLimits,
    handleCloseRateLimitsModal,
  } = useSubscriptionModels(initialModels);

  const isNameValid = isK8sNameDescriptionDataValid(nameDescData);

  const selectedGroupNames = selectedGroups.filter((g) => g.selected).map((g) => String(g.id));

  const initialGroupNames = React.useMemo(
    () =>
      subscription ? new Set(subscription.owner.groups.map((g) => g.name)) : new Set<string>(),
    [subscription],
  );

  const initialModelKeys = React.useMemo(
    () =>
      subscription
        ? new Set(subscription.modelRefs.map((r) => r.name))
        : new Set<string>(),
    [subscription],
  );

  const groupsChanged =
    isEditing &&
    (selectedGroupNames.length !== initialGroupNames.size ||
      selectedGroupNames.some((g) => !initialGroupNames.has(g)));

  const currentModelKeys = new Set(
    models.map((m) => m.modelRefSummary.name),
  );
  const modelsChanged =
    isEditing &&
    (currentModelKeys.size !== initialModelKeys.size ||
      models.some(
        (m) => !initialModelKeys.has(m.modelRefSummary.name),
      ));

  const showPolicyWarning = isEditing && (groupsChanged || modelsChanged);


  const zodFormData: SubscriptionFormData = React.useMemo(
    () => ({
      priority: priority == null || Number.isNaN(priority) ? Number.NaN : priority,
      groups: selectedGroupNames,
      models,
    }),
    [priority, selectedGroupNames, models],
  );

  const { getFieldValidation } = useZodFormValidation(zodFormData, subscriptionFormSchema);

  const isPriorityValid = priority != null && !Number.isNaN(priority);

  const canSubmit =
    isNameValid &&
    getFieldValidation(undefined, true).length === 0 &&
    allModelsHaveRateLimits &&
    isPriorityValid &&
    !isSubmitting;

  const modelRefsPayload = models.map((m) => ({
    ...subscription?.modelRefs.find((ref) => ref.name === m.modelRefSummary.name),
    name: m.modelRefSummary.name,

    tokenRateLimits: m.tokenRateLimits,
  }));

  const handleSubmit = async () => {
    if (priority == null || Number.isNaN(priority)) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const apiOpts: APIOptions = {};
      if (isEditing && subscription) {
        const trimmedName = nameDescData.name.trim();
        const originalName = subscription.displayName ?? subscription.name;
        const request: UpdateSubscriptionRequest = {
          displayName:
            trimmedName !== originalName ? trimmedName || undefined : subscription.displayName,
          description: nameDescData.description.trim() || undefined,
          owner: { ...subscription.owner, groups: selectedGroupNames.map((g) => ({ name: g })) },
          modelRefs: modelRefsPayload,
          tokenMetadata: subscription.tokenMetadata,
          inferencePriority: subscription.inferencePriority,
          guardrails: subscription.guardrails,
          priority,
        };
        await updateSubscription()(apiOpts, subscription.name, request, subscription.revision ?? '');
        fireFormTrackingEvent(MaaSEvents.SUBSCRIPTION_UPDATED, {
          outcome: TrackingOutcome.submit,
          success: true,
          groupCount: selectedGroupNames.length,
          modelCount: models.length,
          hasDescription: nameDescData.description.trim() !== '',
          priority,
          editSource,
        } satisfies SubscriptionUpdatedSuccessProperties);
      } else {
        const request: CreateSubscriptionRequest = {
          name: nameDescData.k8sName.value,
          displayName: nameDescData.name.trim() || undefined,
          description: nameDescData.description.trim() || undefined,
          owner: { groups: selectedGroupNames.map((g) => ({ name: g })) },
          modelRefs: modelRefsPayload,
          priority,
          createAuthPolicy,
        };
        await createSubscription()(apiOpts, request);
        fireFormTrackingEvent(MaaSEvents.SUBSCRIPTION_CREATED, {
          outcome: TrackingOutcome.submit,
          success: true,
          groupCount: selectedGroupNames.length,
          modelCount: models.length,
          hasDescription: nameDescData.description.trim() !== '',
          modelCountAvailable: modelRefs.length,
          hasMatchingPolicy: createAuthPolicy,
          priority,
          prefillSource,
        } satisfies SubscriptionCreatedSuccessProperties);
      }
      refresh();
      navigate(returnTo ?? getSectionUrl('subscriptions'), { state: { notice: isEditing ? 'Subscription updated' : 'Subscription created' } });
    } catch (e) {
      const errMsg =
        e instanceof Error
          ? e.message
          : `Failed to ${isEditing ? 'update' : 'create'} subscription`;
      fireFormTrackingEvent(
        isEditing ? MaaSEvents.SUBSCRIPTION_UPDATED : MaaSEvents.SUBSCRIPTION_CREATED,
        isEditing
          ? ({
              outcome: TrackingOutcome.submit,
              success: false,
              editSource,
            } satisfies SubscriptionUpdatedErrorProperties)
          : ({
              outcome: TrackingOutcome.submit,
              success: false,
            } satisfies SubscriptionCreatedErrorProperties),
      );
      setSubmitError(errMsg);
      setIsSubmitting(false);
    }
  };

  const showNoModelsWarning = !isEditing && modelRefs.length === 0 && models.length === 0;
  const canAddModels = modelRefs.length > 0;

  const prefillSource = preSelectedModel
    ? EventTrackingPrefillSource.MODEL
    : EventTrackingPrefillSource.NONE;

  return (
    <PageSection hasBodyWrapper={false}>
      <Form maxWidth="750px">
        <K8sNameDescriptionField
          data={nameDescData}
          onDataChange={onNameDescChange}
          dataTestId="subscription-name-desc"
        />

        <FormGroup label="Priority" fieldId="subscription-priority" isRequired>
          <FormHelperText>
            <HelperText>
              <HelperTextItem variant="default">
                Higher numbers indicate higher priority.
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
          <NumberInput
            id="subscription-priority"
            data-testid="subscription-priority"
            value={priority == null || Number.isNaN(priority) ? '' : priority}
            min={MIN_PRIORITY}
            max={MAX_PRIORITY}
            onMinus={() =>
              setPriority(
                Math.max(
                  MIN_PRIORITY,
                  (priority == null || Number.isNaN(priority) ? 0 : priority) - 1,
                ),
              )
            }
            onPlus={() =>
              setPriority(
                Math.min(
                  MAX_PRIORITY,
                  (priority == null || Number.isNaN(priority) ? 0 : priority) + 1,
                ),
              )
            }
            onChange={(event: React.FormEvent<HTMLInputElement>) => {
              const inputValue = event.currentTarget.value;
              if (inputValue === '') {
                setPriority(NaN);
              } else {
                const parsed = parseInt(inputValue, 10);
                if (!Number.isNaN(parsed)) {
                  setPriority(Math.min(MAX_PRIORITY, Math.max(MIN_PRIORITY, parsed)));
                }
              }
            }}
          />
        </FormGroup>

        <FormGroup label="Groups" fieldId="subscription-groups" isRequired>
          <FormHelperText>
            <HelperText>
              <HelperTextItem>
                Type each group name and choose Add group to grant access to models in this subscription.
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
          <MultiSelection
            ariaLabel="Enter groups"
            value={selectedGroups}
            setValue={(newValue) => {
              setGroupsTouched(true);
              setSelectedGroups(newValue);
            }}
            toggleTestId="subscription-groups"
            isCreatable
            createOptionMessage={(value) => `Add group "${value}"`}
            placeholder="Type a group name"
          />
          {selectedGroupNames.includes(SYSTEM_AUTHENTICATED_GROUP) && (
            <SystemAuthenticatedWarning />
          )}
          {groupsTouched && getFieldValidation(['groups'], true).length > 0 && (
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant="error">
                  {getFieldValidation(['groups'], true)[0].message}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          )}
        </FormGroup>

        {showNoModelsWarning ? (
          <Alert
            variant="warning"
            isInline
            title="No models available"
            data-testid="no-models-warning"
          >
            There are no model endpoints available on the cluster. To create a subscription, first
            ask your MaaS administrator to make a model endpoint available.
          </Alert>
        ) : (
          <MaasModelsSection
            modelRefSummaries={models.map((m) => m.modelRefSummary)}
            modelRefsWithRateLimits={models.map((m) => ({
              name: m.modelRefSummary.name,

              tokenRateLimits: m.tokenRateLimits,
              unlimited: m.unlimited,
            }))}
            editable
            onAddModels={canAddModels ? () => setIsAddModelsModalOpen(true) : undefined}
            onEditLimits={(index) => setEditLimitsTarget(index)}
            onRemoveModel={(index) => {
              setModelsTouched(true);
              handleRemoveModel(index);
            }}
            validationError={
              modelsTouched && getFieldValidation(['models'], true).length > 0
                ? getFieldValidation(['models'], true)[0].message
                : undefined
            }
            resourceType="subscription"
          />
        )}

        {isAddModelsModalOpen && canAddModels && (
          <AddModelsModal
            availableModelRefs={modelRefs}
            currentModels={models}
            onAdd={(refs) => {
              setModelsTouched(true);
              handleAddModels(refs);
            }}
            onRemove={(refs) => {
              setModelsTouched(true);
              handleRemoveModelsByRef(refs);
            }}
            onClose={() => setIsAddModelsModalOpen(false)}
          />
        )}

        {editLimitsTarget != null && editingModel && (
          <EditRateLimitsModal
            modelName={
              editingModel.modelRefSummary.displayName ?? editingModel.modelRefSummary.name
            }
            rateLimits={editingModel.tokenRateLimits}
            onSave={handleSaveRateLimits}
            onClose={handleCloseRateLimitsModal}
          />
        )}

        {showPolicyWarning && (
          <Alert
            variant="warning"
            isInline
            title="Authorization policies are not automatically updated"
            data-testid="policy-change-warning"
          >
            If this subscription has associated authorization policies, you must manually update
            them from the{' '}
            <b>
              <>authorization policy administration tool</>
            </b>{' '}
            after saving your changes.
          </Alert>
        )}

        {submitError && (
          <Alert
            variant="danger"
            isInline
            title={`Failed to ${isEditing ? 'update' : 'create'} subscription`}
          >
            {submitError}
          </Alert>
        )}

        <ActionGroup>
          <Button
            variant="primary"
            onClick={handleSubmit}
            isDisabled={!canSubmit}
            isLoading={isSubmitting}
            data-testid={isEditing ? 'update-subscription-button' : 'create-subscription-button'}
          >
            {isEditing
              ? isSubmitting
                ? 'Saving...'
                : 'Save'
              : isSubmitting
                ? 'Creating...'
                : 'Create subscription'}
          </Button>
          <Button
            variant="link"
            onClick={() => {
              navigate(returnTo ?? getSectionUrl('subscriptions'));
              fireFormTrackingEvent(
                isEditing ? MaaSEvents.SUBSCRIPTION_UPDATED : MaaSEvents.SUBSCRIPTION_CREATED,
                isEditing
                  ? ({
                      outcome: TrackingOutcome.cancel,
                      editSource,
                    } satisfies SubscriptionUpdatedCancelProperties)
                  : ({
                      outcome: TrackingOutcome.cancel,
                      modelCount: models.length,
                      modelCountWoLimit: modelRefsPayload.filter(
                        (m) => m.tokenRateLimits.length === 0,
                      ).length,
                    } satisfies SubscriptionCreatedCancelProperties),
              );
            }}
            isDisabled={isSubmitting}
            data-testid="cancel-subscription-button"
          >
            Cancel
          </Button>
        </ActionGroup>
      </Form>
    </PageSection>
  );
};

export default CreateSubscriptionForm;
