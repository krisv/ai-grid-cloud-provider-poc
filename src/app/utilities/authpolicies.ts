// Adapted from opendatahub-io/odh-dashboard
// packages/maas/frontend/src/app/utilities/authpolicies.ts
// upstream commit: 8051fbbea117457b4da4074fb2856b732e6677a4
import { MaaSAuthPolicy, MaaSModelRefSummary } from '~/app/types/subscriptions';

export const DEFAULT_MODEL_KIND = 'LLMInferenceService' as const;

/**
 * Resolves bare model refs (name) into full MaaSModelRefSummary objects
 * using the live summaries, falling back to a synthetic entry for deleted models.
 */
export const modelRefsToSummaries = (
  refs: { name: string; displayName?: string }[],
  summaries: MaaSModelRefSummary[],
): MaaSModelRefSummary[] =>
  refs.map((ref) => {
    const matchedModelRef = summaries.find(
      (c) => c.name === ref.name,
    );
    if (matchedModelRef) {
      return matchedModelRef;
    }
    return {
      name: ref.name,

      displayName: ref.displayName,
      modelRef: { kind: DEFAULT_MODEL_KIND, name: ref.name },
    };
  });
