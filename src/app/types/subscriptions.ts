// Adapted from opendatahub-io/odh-dashboard
// packages/maas/frontend/src/app/types/subscriptions.ts
// upstream commit: 8051fbbea117457b4da4074fb2856b732e6677a4
export type MaaSSubscription = {
  /** Opaque backend revision; never a Kubernetes resourceVersion. */
  revision?: string;
  // Compatibility fields from models-as-a-service commit 83391711e701f17ddb9b212aa81e591ec1758d15,
  // maas-controller/api/maas/v1alpha1/maassubscription_types.go; preserved, not newly edited.
  inferencePriority?: number;
  guardrails?: GuardrailAttachment[];
  name: string;
  displayName?: string;
  description?: string;
  phase?: string;
  statusMessage?: string;
  status?: string;
  conditionType?: string;
  lastTransitionTime?: string;
  reason?: string;
  priority?: number;
  owner: OwnerSpec;
  modelRefs: ModelSubscriptionRef[];
  tokenMetadata?: TokenMetadata;
  creationTimestamp?: string;
  deletionTimestamp?: string;
};

export type GuardrailAttachment = { ref: { name: string }; checks?: string[] };

export type ModelSubscriptionRef = {
  unlimited?: boolean;
  guardrails?: GuardrailAttachment[];
  name: string;
  displayName?: string;
  description?: string;
  tokenRateLimits: TokenRateLimit[];
  billingRate?: BillingRate;
};

export type BillingRate = {
  perToken: string;
};

export type TokenRateLimit = {
  limit: number;
  window: string;
};

export type OwnerSpec = {
  users?: string[];
  groups: GroupReference[];
};

export type GroupReference = {
  name: string;
};

export type TokenMetadata = {
  organizationId?: string;
  costCenter?: string;
  labels?: Record<string, string>;
};

export type MaaSSubscriptionListResponse = {
  object: string;
  data: MaaSSubscription[];
};

export type ModelRef = {
  name: string;
  displayName?: string;
  description?: string;
};

export type ModelReference = {
  kind: string;
  name: string;
};

export type MaaSModelRefSummary = {
  revision?: string;
  creationTimestamp?: string;
  name: string;
  displayName?: string;
  description?: string;
  modelRef: ModelReference;
  phase?: string;
  endpoint?: string;
  status?: string;
  reason?: string;
  statusMessage?: string;
  conditionType?: string;
  lastTransitionTime?: string;
};

export type SubjectSpec = {
  groups?: GroupReference[];
};

export type CreateSubscriptionRequest = {
  name: string;
  displayName?: string;
  description?: string;
  owner: OwnerSpec;
  modelRefs: ModelSubscriptionRef[];
  priority: number;
  createAuthPolicy: boolean;
};

export type UpdateSubscriptionRequest = {
  inferencePriority?: number;
  guardrails?: GuardrailAttachment[];
  displayName?: string;
  description?: string;
  owner: OwnerSpec;
  modelRefs: ModelSubscriptionRef[];
  tokenMetadata?: TokenMetadata;
  priority: number;
};

export type CreateSubscriptionResponse = {
  subscription: MaaSSubscription;
  authPolicy?: MaaSAuthPolicy;
};

export type MaaSAuthPolicy = {
  displayName?: string;
  description?: string;
  name: string;
  phase?: string;
  statusMessage?: string;
  reason?: string;
  status?: string;
  conditionType?: string;
  lastTransitionTime?: string;
  creationTimestamp?: string;
  modelRefs: ModelRef[];
  subjects: SubjectSpec;
  meteringMetadata?: TokenMetadata;
  deletionTimestamp?: string;
};

export type SubscriptionInfoResponse = {
  subscription: MaaSSubscription;
  modelRefs: MaaSModelRefSummary[];
  authPolicies: MaaSAuthPolicy[];
  meteringMetadata?: TokenMetadata;
};

export type SubscriptionModelEntry = {
  unlimited?: boolean;
  modelRefSummary: MaaSModelRefSummary;
  tokenRateLimits: TokenRateLimit[];
};

export type TokenRateLimitInfo = {
  limit: number;
  window: string;
};

export type BillingRateInfo = {
  per_token: string;
};

export type ModelRefInfo = {
  name: string;
  display_name?: string;
  source?: string;
  description?: string;
  token_rate_limits?: TokenRateLimitInfo[];
  billing_rate?: BillingRateInfo;
};

export type UserSubscription = {
  subscription_id_header: string;
  subscription_description: string;
  display_name?: string;
  priority: number;
  key_count?: number;
  model_refs: ModelRefInfo[];
  organization_id?: string;
  cost_center?: string;
  labels?: Record<string, string>;
};

export type RateLimit = {
  count: number;
  time: number;
  unit: 'hour' | 'minute' | 'second';
};

export type ModelOverviewSubscription = {
  name: string;
  displayName?: string;
  phase?: string;
  statusMessage?: string;
  reason?: string;
  status?: string;
  conditionType?: string;
  lastTransitionTime?: string;
  groups?: string[];
  tokenRateLimits?: TokenRateLimit[];
};

export type ModelOverviewPolicy = {
  name: string;
  displayName?: string;
  phase?: string;
  statusMessage?: string;
  reason?: string;
  status?: string;
  conditionType?: string;
  lastTransitionTime?: string;
  groups?: string[];
};

export type ModelOverviewDetails = {
  displayName?: string;
  description?: string;
  phase?: string;
  statusMessage?: string;
  reason?: string;
  status?: string;
  conditionType?: string;
  lastTransitionTime?: string;
};

export type ModelOverviewItem = {
  id: string;
  modelDetails: ModelOverviewDetails;
  subscriptions: ModelOverviewSubscription[];
  authPolicies: ModelOverviewPolicy[];
};

export const SYSTEM_AUTHENTICATED_GROUP = 'system:authenticated';
