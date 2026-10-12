# MaaS Administration Portal

## Objective

Build a standalone administration portal that reuses the OpenShift AI Models-as-a-Service (MaaS) **administrator subscription management UI** as faithfully as possible.

The portal runs independently from the OpenShift AI dashboard, but it ultimately manages the same OpenShift AI MaaS subscription resources.

The first milestone is the **Subscription Management** view.

Do not redesign this view unless necessary to make it standalone. Prefer extracting and reusing the existing OpenShift AI implementation.

The portal will later contain additional MaaS administration views, so keep the application architecture modular.

---

# Upstream projects

The primary upstream frontend is:

https://github.com/opendatahub-io/odh-dashboard

MaaS functionality is primarily under:

```text
packages/maas
```

Also inspect related code elsewhere in the repository when referenced by MaaS components.

The underlying MaaS implementation is:

https://github.com/opendatahub-io/models-as-a-service

This repository is useful for understanding:

* MaaSSubscription resources
* subscription semantics
* model access
* rate limits
* authentication/authorization behavior
* controller behavior

Do not assume that the frontend API must match the existing Kubernetes implementation.

---

# Primary goal

Extract the current OpenShift AI **administrator Subscription Management UI** into this standalone portal.

Preserve as much upstream behavior as practical, including:

* subscription list
* subscription filtering
* subscription sorting
* subscription details
* create subscription
* edit subscription
* delete subscription
* model selection
* user/group access configuration
* rate-limit configuration
* quota configuration, if present
* validation
* confirmation dialogs
* loading states
* empty states
* error states
* notifications

Use the same data fields and domain semantics as OpenShift AI MaaS.

The visual appearance should remain as close as practical to the upstream OpenShift AI UI.

---

# Important architectural constraint

The browser MUST NOT communicate directly with Kubernetes or OpenShift APIs.

Use this architecture:

```text
Standalone MaaS Admin Portal
            |
            | HTTP API
            v
Subscription Management API
            |
            | Kubernetes/OpenShift integration
            v
OpenShift AI MaaS
```

The backend API abstracts away:

* Kubernetes API calls
* Custom Resources
* resourceVersion handling
* namespaces
* OpenShift authentication
* Kubernetes RBAC
* controller implementation details
* reconciliation details

The frontend should deal with MaaS domain objects rather than Kubernetes implementation details whenever possible.

---

# Do not invent the REST API first

The backend API is still being developed.

Do NOT start by arbitrarily designing endpoints.

Instead:

1. Inspect the current upstream OpenShift AI administrator subscription UI.
2. Identify every piece of data it reads.
3. Identify every mutation it performs.
4. Identify supporting lookups required by forms.
5. Identify validation assumptions.
6. Identify OpenShift-dashboard-specific dependencies.
7. Derive the frontend-facing API contract from those requirements.

The existing UI should drive the first version of the API contract.

---

# Phase 1 — Upstream analysis

Before implementing the standalone version, inspect the latest appropriate version of:

```text
opendatahub-io/odh-dashboard
```

Locate the exact files implementing administrator subscription management.

Search broadly for terms including:

```text
subscription
MaaSSubscription
maas
rate limit
quota
model access
admin
```

Document the dependency chain.

For each relevant component determine whether it is:

```text
REUSE
ADAPT
REPLACE
```

Use these definitions:

### REUSE

Component can be copied/extracted with little or no modification.

Examples:

* PatternFly tables
* forms
* dialogs
* presentation components
* validation logic

### ADAPT

Component contains useful upstream logic but depends on OpenShift dashboard infrastructure.

Examples:

* hooks
* API clients
* context providers
* routing integration
* notification integration

### REPLACE

Component is fundamentally tied to the OpenShift dashboard environment.

Examples may include:

* dashboard application shell
* OpenShift authentication
* direct Kubernetes clients
* dashboard-specific routing
* dashboard feature flags
* cluster-specific context

Do not assume a component belongs in a category until its dependencies have been inspected.

---

# Record upstream provenance

For extracted code, record:

* upstream repository
* upstream commit SHA
* original file path

Where practical, add a short source comment such as:

```typescript
// Adapted from:
// opendatahub-io/odh-dashboard
// packages/maas/...
// upstream commit: <sha>
```

Do not repeatedly modify copied upstream components merely for stylistic preferences.

Keeping diffs understandable is important because we may want to compare against future upstream changes.

Review and preserve all required Apache-2.0 license notices and attribution.

---

# Frontend architecture

Prefer a structure similar to:

```text
src/
  app/
    App.tsx
    routes/
    layout/

  features/
    subscriptions/
      components/
      pages/
      hooks/
      types/
      adapters/

  services/
    subscriptions/
      SubscriptionService.ts
      MockSubscriptionService.ts
      HttpSubscriptionService.ts

  shared/
    api/
    components/
    hooks/
    types/
```

This is guidance rather than an absolute requirement.

Do not restructure useful upstream components unnecessarily.

---

# UI technology

Prefer the technologies already used by the upstream UI where practical.

In particular preserve:

* React
* TypeScript
* PatternFly

Use PatternFly components rather than recreating OpenShift-looking controls manually.

The standalone portal should visually resemble the original OpenShift AI administration UI.

Do not introduce another component framework unless there is a strong technical reason.

---

# Subscription service boundary

Create a clean service boundary between UI code and backend communication.

For example:

```typescript
export interface SubscriptionService {
  list(...args: unknown[]): Promise<unknown>;

  get(id: string): Promise<unknown>;

  create(input: unknown): Promise<unknown>;

  update(id: string, input: unknown): Promise<unknown>;

  delete(id: string): Promise<void>;
}
```

This example is intentionally incomplete.

DO NOT copy this interface blindly.

Derive the actual types and operations from the upstream frontend.

Preserve upstream MaaS TypeScript types where they are appropriate.

If the upstream frontend expects additional operations, add them explicitly.

Examples might include:

```text
listModels()
listGroups()
getSubscription()
validateSubscription()
```

Again, derive these from actual source usage.

---

# Mock implementation

The first working version MUST NOT require a real OpenShift cluster.

Implement a mock subscription backend.

The mock implementation should support all UI behavior required for:

* listing
* viewing
* creating
* editing
* deleting

Also mock supporting data such as models, groups, quotas, or limits when required.

Prefer realistic OpenShift AI MaaS objects.

The mock implementation should behave sufficiently like a real backend that replacing it with HTTP does not require rewriting UI components.

---

# HTTP implementation

Create a separate HTTP implementation of the service boundary.

For example:

```text
SubscriptionService
       ^
       |
 +-----+------+
 |            |
Mock         HTTP
Service      Service
```

UI components MUST NOT contain direct `fetch()` calls for subscription operations.

They should communicate through the service/data-access layer.

The HTTP implementation may initially contain placeholders until the backend API contract is finalized.

---

# API contract

After analyzing the upstream UI, create:

```text
docs/subscription-api-contract.md
```

The document should describe exactly what the standalone frontend requires from the future backend.

Include:

* operations
* request fields
* response fields
* filtering
* sorting
* pagination, if needed
* model lookup requirements
* user/group lookup requirements
* validation behavior
* rate-limit fields
* quota fields
* expected errors
* optimistic concurrency requirements, if applicable

Separate:

```text
UI domain requirements
```

from:

```text
Kubernetes/OpenShift implementation details
```

The frontend-facing API should not expose Kubernetes concepts unless they are genuinely part of the MaaS domain model.

---

# Domain compatibility

The portal ultimately manages OpenShift AI MaaS.

Therefore do NOT create a simplified subscription model that loses information required by OpenShift AI.

The backend abstraction should remain capable of representing the same effective subscription configuration.

When there is a conflict between inventing a cleaner model and preserving OpenShift AI behavior, preserve OpenShift AI behavior for the initial implementation.

We can redesign later.

---

# Authentication

Authentication for the standalone portal is not part of the first milestone unless required to make the application structure work.

Keep authentication behind a replaceable boundary.

Do not embed OpenShift dashboard authentication assumptions deeply into feature components.

Do not expose Kubernetes credentials to the browser.

---

# Error handling

The UI must handle:

* loading
* backend unavailable
* validation failure
* authorization failure
* not found
* update conflicts
* delete failure

Preserve upstream error behavior where practical.

Avoid exposing raw Kubernetes errors to users.

---

# Initial route

Provide a route similar to:

```text
/subscriptions
```

This should display the administrator subscription management view.

Create/edit/details routes or dialogs should follow the upstream UI behavior where practical.

---

# Future portal features

The architecture should make it straightforward to later add areas such as:

```text
Overview
Subscriptions
Models
API Keys
Usage
Analytics
Policies
Settings
```

Do NOT implement these yet unless they are necessary dependencies of Subscription Management.

Avoid premature framework abstractions for hypothetical future features.

---

# Implementation priorities

Use this priority order when making tradeoffs:

1. Correct OpenShift AI MaaS semantics
2. Faithful reproduction of the upstream admin UI
3. Clean separation between UI and API
4. Standalone operation
5. Maintainability
6. Ability to track upstream changes
7. Developer convenience

---

# First milestone

Deliver a standalone application where:

* the application starts locally
* OpenShift is not required
* Kubernetes is not required
* the Subscription Management page renders
* it closely matches the current OpenShift AI administrator UI
* subscriptions are loaded from the mock service
* subscriptions can be created
* subscriptions can be edited
* subscriptions can be deleted
* relevant form validation works
* model/group/etc. selectors work with mock data
* no subscription UI component directly depends on Kubernetes
* the service abstraction is ready for a real HTTP backend

---

# Required analysis artifacts

Before or alongside implementation, create:

```text
docs/upstream-subscription-ui.md
docs/subscription-api-contract.md
```

`upstream-subscription-ui.md` should contain:

* upstream commit SHA
* relevant upstream files
* component hierarchy
* important hooks
* relevant TypeScript types
* API/data dependencies
* OpenShift-dashboard-specific dependencies
* REUSE / ADAPT / REPLACE decisions
* unresolved questions

`subscription-api-contract.md` should contain the frontend requirements for the future backend.

---

# Development workflow

When starting work:

1. Inspect this repository.
2. Inspect the upstream OpenShift AI dashboard source.
3. Identify the administrator subscription implementation.
4. Record the upstream commit SHA.
5. Build the dependency map.
6. Write `docs/upstream-subscription-ui.md`.
7. Extract the minimum required UI.
8. Remove or adapt OpenShift-dashboard-specific dependencies.
9. Introduce the SubscriptionService boundary.
10. Implement the mock service.
11. Make the UI functional against mocks.
12. Derive and document the HTTP API contract.
13. Add the HTTP service skeleton.
14. Add tests for important transformations and CRUD flows.
15. Verify the standalone application builds and runs.

Do not begin by rewriting the UI from screenshots.

Use the actual upstream source.

---

# Testing

At minimum test:

* subscription list rendering
* create flow
* edit flow
* delete flow
* validation
* conversion between API/domain objects and UI objects
* backend error handling

Prefer testing domain adapters and transformations separately from presentation components.

---

# Avoid

Do NOT:

* rewrite the OpenShift AI UI unnecessarily
* communicate directly with Kubernetes from the browser
* tightly couple React components to REST endpoints
* invent a reduced subscription model
* embed OpenShift credentials in the frontend
* recreate PatternFly components manually
* add unrelated portal functionality during milestone 1
* make large stylistic changes to extracted upstream code
* invent API fields without checking upstream requirements
* silently drop MaaS fields because the mock backend does not use them

---

# Decision rule

Whenever uncertain about expected behavior:

1. Check the current OpenShift AI MaaS administrator UI source.
2. Preserve its behavior.
3. Isolate OpenShift-specific infrastructure behind an adapter.
4. Document unresolved differences.

The OpenShift AI administrator Subscription Management UI is the behavioral reference implementation for milestone 1.

