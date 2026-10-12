// Adapted from opendatahub-io/odh-dashboard
// packages/maas/frontend/src/app/hooks/useGovernanceAffectedModels.ts
// upstream commit: 8051fbbea117457b4da4074fb2856b732e6677a4
import * as React from 'react';
import { useMaaSGovernanceContext } from '~/app/context/MaaSGovernanceContext';
import type { AffectedModel } from '~/app/types/maas-model';
import type { MaaSSubscription } from '~/app/types/subscriptions';
import {
  getAffectedModelsFromRefs,
  normalizePhase,
  PhaseStatus,
} from '~/app/utilities/phaseLabelUtils';

export type GovernanceAffectedModelsState = {
  affectedModels: AffectedModel[] | undefined;
  overviewLoaded: boolean;
};

const isDegradedPhase = (phase: string | undefined): boolean =>
  normalizePhase(phase) === PhaseStatus.DEGRADED;

export const useSubscriptionAffectedModels = (
  subscription: Pick<MaaSSubscription, 'modelRefs' | 'phase'>,
): GovernanceAffectedModelsState => {
  const { modelRefs, overviewLoaded } = useMaaSGovernanceContext();

  const affectedModels = React.useMemo(() => {
    if (!overviewLoaded || !isDegradedPhase(subscription.phase)) {
      return undefined;
    }
    return getAffectedModelsFromRefs(subscription.modelRefs, modelRefs);
  }, [overviewLoaded, subscription.modelRefs, subscription.phase, modelRefs]);

  return { affectedModels, overviewLoaded };
};

