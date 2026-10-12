# Administrator subscription UI extraction

Reference repository: https://github.com/opendatahub-io/odh-dashboard

Pinned commit: `8051fbbea117457b4da4074fb2856b732e6677a4` (local shallow clone of main).

This analysis uses source, not screenshots. All paths below are relative to that repository. The full extracted-file manifest is [upstream-provenance.json](upstream-provenance.json). Source comments record the original path and commit; the upstream Apache-2.0 license is retained at the project root.

## Component hierarchy and dependency decisions

| Source | Dependencies and behavior | Decision |
| --- | --- | --- |
| `packages/maas/frontend/src/app/pages/maas-governance/SubscriptionsTab.tsx` | Governance context, keyword filter, empty/loading/error states, table and deletion dialog | ADAPT: standalone context and telemetry boundary |
| `…/pages/subscriptions/allSubscriptions/SubscriptionsTable.tsx` | Dashboard Table wrapper, sortable columns, pagination, compound expansion | ADAPT: small PatternFly table wrapper replacing dashboard table infrastructure |
| `…/allSubscriptions/SubscriptionTableRow.tsx` | Name/description, phase status, groups/models expansion, priority, action menu; synthesized Kubernetes resource for dashboard row/tooltip | ADAPT: domain name tooltip and deletion state without Kubernetes objects |
| `…/allSubscriptions/SubscriptionsToolbar.tsx`, `columns.ts`, `const.ts` | Keyword search and create navigation; five sortable columns | ADAPT toolbar boundary; REUSE column comparators and filter definitions |
| `…/pages/subscriptions/CreateSubscriptionPage.tsx`, `EditSubscriptionPage.tsx` | Dashboard page shell, governance context, subscription-info lookup, breadcrumbs/routing | ADAPT shell and routes |
| `…/createSubscription/CreateSubscriptionForm.tsx` | Name/description, groups, models, priority, optional auth-policy creation, validation, mutations and warnings | ADAPT imports/service; retain upstream form |
| `…/createSubscription/EditRateLimitsModal.tsx`, `RateLimitRow.tsx` | PatternFly numeric controls, duration conversion, Zod schemas | REUSE |
| `…/pages/subscriptions/ViewSubscriptionPage.tsx` | Details/groups/models, actions, resource YAML tab | ADAPT; domain configuration export replaces raw resource YAML editing |
| `…/viewSubscription/SubscriptionGroupsSection.tsx`, `utils.ts` | PatternFly table and token-limit formatting | REUSE |
| `…/viewSubscription/SubscriptionDetailsSection.tsx` | Name/status/description/resource name/created, phase modal | ADAPT telemetry imports |
| `…/DeleteSubscriptionModal.tsx`, `…/shared/DeleteModal.tsx` | Typed name confirmation, async delete state/error | ADAPT service hook; REUSE dialog presentation |
| `…/shared/AddModelsModal.tsx` | Model summaries, subscriptions, policies, pending additions/removals, search and sorting | REUSE |
| `…/shared/MaasModelsSection.tsx`, `ExpandedGroupsPanel.tsx`, `ExpandedModelsPanel.tsx`, `CompoundExpandCountCell.tsx`, `SystemAuthenticatedWarning.tsx` | PatternFly presentation | REUSE except dashboard title/description import |
| `…/shared/Phase/*`, `…/utilities/phaseLabelUtils.tsx` | Status normalization, conditions, affected model summaries and dialogs | ADAPT infrastructure imports; retain presentation and phase semantics |
| `…/hooks/useSubscriptionModels.ts` | Deduplication by project/name, removal index correction, token limits, telemetry | ADAPT telemetry; preserve logic |
| `…/hooks/useGovernanceAffectedModels.ts` | Join model references against context for degraded status | ADAPT context |
| `…/hooks/useGetSubscriptionInfo.ts`, `useDeleteSubscription.ts` | mod-arch fetch/polling, REST API closures | REPLACE with standalone service hooks |
| `…/context/MaaSGovernanceContext.tsx` | Four independent lookups, refresh/polling, system:authenticated group injection, unrelated overview join | REPLACE context; retain subscription and form lookup behavior |
| `…/api/subscriptions.ts` | mod-arch transport/envelopes, runtime shape checks, null token-limit normalization | REPLACE transport; retain normalization in adapter |
| `…/types/subscriptions.ts`, `types/maas-model.ts` | Domain DTOs including billing, metering and status | REUSE; add opaque revision for concurrency |
| `packages/ui-core/src/components/MultiSelection.tsx` | PatternFly typeahead, creatable entries, labels, select popper helpers | ADAPT popper helper import; retain component |
| `packages/ui-core/src/components/K8sNameDescriptionField/*` | Presentation plus naming hook, pure naming rules from k8s-core | ADAPT pure naming adapter; no Kubernetes SDK or API |
| `packages/ui-core/src/hooks/useZodFormValidation.ts`, `utilities/useValidation.ts` | Field validation/touched state | REUSE |
| Dashboard shell, federation, feature flags, OpenShift session/RBAC, analytics transport | Host-specific infrastructure | REPLACE with standalone composition root and replaceable service boundary |

`…` in the table means `packages/maas/frontend/src/app`.

## Data and mutations traced

Administrator operations in `api/subscriptions.ts`: list subscriptions; get joined subscription info; create; update; delete; list group names; list all MaaS model summaries; fetch resource YAML. `api/auth-policies.ts` supplies policy lookup for the model selector. User subscription/API-key pages are separate and excluded.

The list reads name/displayName/description, phase/condition details, deletionTimestamp, owner.groups, modelRefs and priority. Filtering is case-insensitive across name, display name and description. Sorting covers display name, normalized phase, group count, model count and priority. Dashboard Table paginates locally.

Forms require complete subscription, model, group and policy lists. Model selection shows both existing subscription and policy associations; association is information, not a prohibition. Existing references and groups must survive missing lookups. Model identity is project/name, not display name. Details join referenced models to live summaries with a fallback for missing models.

Creation sends name/displayName/description, groups, model references with token limits, priority and createAuthPolicy (default true). Updating sends displayName/description, groups, model references, priority and optional tokenMetadata. Deletion removes the subscription, not its separate policies.

The source form would omit billingRate on update. The standalone adaptation explicitly retains billingRate and other existing model-reference fields, as well as tokenMetadata, when unchanged. This prevents information loss mandated by task.md.

## Validation and semantics

Display name is required; resource name is generated from it and separately editable during creation, immutable during editing. Pure upstream naming logic permits lowercase alphanumeric and hyphen names up to 253 characters. Groups: at least one, creatable free-text names, with system:authenticated offered even if the lookup omits it. The broad-access warning is preserved. Models: at least one with at least one token limit each. Priority: whole number from -1,000,000 to 1,000,000. Token count: integer 1..1,000,000,000; window value: integer 1..9,999 with second/minute/hour units. Multiple windows are supported.

Subscriptions and authorization policies are distinct. Creation can create a matching policy. Changing groups/models on an existing subscription warns that policies are not automatically updated. The portal does not implement unrelated policy management.

No general quota form, per-user selector, or billing/metering editor is present in this administrator subscription form. These must not be invented; billing/metering fields still need lossless storage and update handling.

## Differences and open questions

- Raw Kubernetes YAML is replaced with a read-only export of the domain configuration; backend resource serialization/editing is outside the browser boundary.
- Dashboard analytics is a no-op replaceable adapter; no external events are sent.
- Authentication is deferred; the HTTP service accepts a transport so future authentication stays outside feature components.
- The source uses namespace as model project identity; retain it in the compatibility DTO until backend model IDs/project labels are agreed. The backend chooses the subscription storage namespace.
- HTTP routes are a proposal derived from these operations, not an agreed backend contract. Opaque revisions/ETags replace Kubernetes resourceVersion.
- The controller cross-check below records version differences; the future backend must preserve controller fields absent from the dashboard UI.

## Controller cross-check

The second repository is now available locally and inspected at `83391711e701f17ddb9b212aa81e591ec1758d15`:

- `maas-controller/api/maas/v1alpha1/maassubscription_types.go`: owner groups **and users**, per-model limits or unlimited access (mutually exclusive), billing, token metadata, subscription priority, separate inference scheduling priority, subscription/model guardrail attachments.
- `maas-controller/api/maas/v1alpha1/common_types.go`: guardrail attachment shape `{ref:{name}, checks?:string[]}`; no namespace on policy references.
- `maas-controller/pkg/controller/maas/maassubscription_controller.go`: materializes per-model token policy configuration, validates compact duration/limit bounds, supports unlimited references, reports duplicate subscription priorities without prohibiting them. Subscription selection priority and inference scheduling priority are different.
- `maas-api/internal/subscription/selector.go`: parses owner users as well as groups.

This controller version contains fields absent from the dashboard DTO/form. The standalone types therefore include optional owner.users, inferencePriority, guardrails and model unlimited/guardrails. They are retained when editing existing objects, including nested owner/model fields; no new editor is invented for them. Existing unlimited models display “Unlimited” and keep that configuration; the token-limit editor is disabled for those rows. Newly added models follow the upstream requirement to configure limits. Backend updates must retain unexposed configuration. Token metadata organization/cost-center fields are optional in the controller and the compatibility DTO accepts that.
