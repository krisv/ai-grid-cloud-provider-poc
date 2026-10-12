// Adapted from opendatahub-io/odh-dashboard
// packages/maas/frontend/src/app/types/maas-model.ts
// upstream commit: 8051fbbea117457b4da4074fb2856b732e6677a4
// From packages/maas/bff/internal/models/model.go
export type MaaSModelDetails = {
  displayName?: string;
  description?: string;
  genaiUseCase?: string;
  contextWindow?: string;
};

export type MaaSModelSubscriptionInfo = {
  name: string;
  displayName?: string;
  description?: string;
};

export type MaaSModel = {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  ready: boolean;
  url?: string;
  modelDetails?: MaaSModelDetails;
  kind?: string;
  subscriptions?: MaaSModelSubscriptionInfo[];
};

export type MaaSModelRef = {
  name: string;
  modelRef: ModelReference;
  phase?: string;
  endpoint?: string;
  displayName?: string;
  description?: string;
  modelCapabilities?: string[];
};

export type ModelReference = {
  kind: string;
  name: string;
};

export type CreateMaaSModelRefRequest = {
  name: string;
  modelRef: ModelReference;
  endpointOverride?: string;
  uid?: string;
  displayName?: string;
  description?: string;
  modelCapabilities?: string[];
};

export type UpdateMaaSModelRefRequest = {
  modelRef: ModelReference;
  endpointOverride?: string;
  displayName?: string;
  description?: string;
  modelCapabilities?: string[];
};

export type DeleteMaaSModelRefResponse = {
  message: string;
};

export type AffectedModel = {
  name: string;
  displayName?: string;
  phase?: string;
  statusMessage?: string;
};
