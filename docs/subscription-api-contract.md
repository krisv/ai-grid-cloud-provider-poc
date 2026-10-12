# Subscription API requirements

Derived from the administrator source at dashboard commit `8051fbbea117457b4da4074fb2856b732e6677a4`; see [analysis](upstream-subscription-ui.md). This frontend contract is implemented by the local Git filesystem PoC backend; it remains a proposal for a future cluster-integrated backend. See [Git backend](git-backend.md). TypeScript requirements live in `src/services/subscriptions/SubscriptionService.ts` and the retained `src/app/types/subscriptions.ts` DTOs.

## UI domain requirements

| Operation | Input | Output |
| --- | --- | --- |
| list | none | complete `MaaSSubscription[]`, each with opaque revision |
| getInfo | subscription name | subscription, joined model summaries, related auth policies, optional metering metadata |
| create | CreateSubscriptionRequest | subscription and optional created authorization policy |
| update | name, UpdateSubscriptionRequest, expected revision | updated subscription and optional policy response (policy is not changed) |
| delete | name, expected revision | no value; generated matching policy removed atomically, separately managed policies remain |
| listModels | none | unified managed model list; registered models populate subscription selection |

Subscription fields: stable name, displayName, description, owner.groups `{name}[]`, modelRefs, priority, tokenMetadata, status fields (phase/status/statusMessage/conditionType/reason/lastTransitionTime), creationTimestamp, deletionTimestamp, opaque revision. Namespace is internal backend configuration and is absent from every public DTO. Requests containing namespace are rejected.

Model references: name, optional displayName/description, tokenRateLimits `{limit,window}[]`, optional billingRate `{perToken:string}`. Preserve billing decimal strings precisely. The standalone authorization-policy list endpoint is removed; subscription details still include related policies. Lookup summaries include modelRef `{kind,name}`, phase/condition details and optional endpoint. The Add models dialog shows model names only. The backend injects the configured default namespace into CR metadata and subscription/policy model references. Model names are unique within this backend scope.

Token metadata: organizationId, costCenter, optional string labels. Policy objects: name, optional displayName/description/status fields, modelRefs, subjects.groups, optional meteringMetadata, timestamps. These separate policies grant access; a subscription alone does not. Joined policies are read-only dependencies here.

Create fields: name, optional displayName/description, owner, modelRefs, priority, createAuthPolicy. CreateAuthPolicy is always true in the UI, with the option hidden and asks the backend to create a separate matching policy. Any partial creation must be reported explicitly; do not imply success if policy creation fails. Updates preserve existing billing/model metadata and tokenMetadata; omitted tokenMetadata means retain unchanged. Status and timestamps are read-only. Removing models intentionally removes their configuration. Update is a replacement of UI-editable fields, not a full replacement of all controller configuration; the backend MUST preserve absent, unedited fields.

## Filtering, sorting and pagination

The UI requires complete model lists for selection. Initially the service returns all records and the UI filters, sorts and paginates locally. Keyword filter is case-insensitive over stable name, display name and description. Sort: displayName-or-name, normalized phase, number of groups, number of models, numeric priority (missing = 0). Table defaults to 10 items. No server pagination requirement exists yet. A future paginated API must also support complete form associations and counts, and must not truncate silently.

## Validation

Nonblank display name; stable resource name with lowercase alphanumerics/hyphens, alphanumeric start/end and maximum 253 characters. Name is immutable on edit and unique in the backend's subscription scope. Priority integer -1,000,000..1,000,000. At least one nonblank group; unknown group names allowed. Warn about broad access when the user enters system:authenticated. At least one unique model name reference. Each selected model requires one or more limits: integer token count 1..1,000,000,000 and positive integer window 1..9,999 in seconds/minutes/hours (`s`, `m`, `h` compact syntax). Existing rate-window values must be preserved until explicitly edited. Source duration parser approximates compound durations; the adapter must avoid automatic rewrite on unrelated edits.

Backend validation is authoritative. Existing references absent from a lookup must remain editable/preservable rather than silently disappearing. Controller cross-check at `83391711e701f17ddb9b212aa81e591ec1758d15` additionally requires lossless owner.users, inferencePriority, subscription/model guardrails `{ref:{name},checks?:string[]}`, and model unlimited flags. Existing unlimited references use an empty normalized tokenRateLimits array and cannot have limits added without an explicit conversion. The backend omits that empty array when serializing an unlimited CR reference. The dashboard form has no controls for these additional fields, so they remain unchanged on unrelated edits. No quota or individual-user form is in the traced source. Billing and metering are retained, though not edited in milestone 1.

## HTTP contract and concurrency

After tracing the operations, the HTTP adapter and Git PoC implement these routes under configurable base URL `/api`:

| Verb/path | Request/response |
| --- | --- |
| GET `/subscriptions` | JSON subscription array |
| GET `/subscriptions/{name}` | JSON SubscriptionInfoResponse |
| POST `/subscriptions` | JSON CreateSubscriptionRequest / CreateSubscriptionResponse |
| PUT `/subscriptions/{name}` | JSON UpdateSubscriptionRequest / CreateSubscriptionResponse |
| DELETE `/subscriptions/{name}` | 204 |
| GET `/models` | JSON model summary array |

JSON bodies are direct domain objects (no mod-arch `data` envelope). URLs encode stable names. List/info/mutation responses include an opaque revision on subscription objects. Updates and deletes send `If-Match` with that quoted opaque revision. Missing revisions yield 428; a stale revision yields 409 or 412; clients retain unsaved input and tell the user to reload. The frontend never sees resourceVersion. Cluster-backend route agreement is still needed; the transport is isolated so changes do not affect components.

## Errors and response validation

ServiceError codes: unavailable, validation, unauthorized, forbidden, not_found, conflict, invalid_response. HTTP mappings: connection failure/5xx → unavailable; 400/413/415/422 → validation; 401 → unauthorized; 403 → forbidden; 404 → not_found; 409/412/428 → conflict. Error response may have a user-safe `message` and `fieldErrors` string map; no raw cluster errors, credentials or stack traces. The HTTP adapter uses safe local messages, with validation field messages when supplied. Runtime schemas validate responses and normalize null tokenRateLimits to []; malformed payloads fail visibly rather than filtering out records.

Loading and read failures must be visible; retry is available from the page. Mutation errors preserve the form/dialog. Delete failure must leave the subscription visible and the dialog open. Concurrent deletion is a not-found response.

## Kubernetes/OpenShift implementation details

The backend owns CRD serialization, namespaces for subscriptions/policies, authorization/RBAC, authentication, reconciliation, resourceVersion, controller errors and integration credentials. Retained domain type names describe MaaS semantics, not browser Kubernetes clients. The composition root selects browser-local mocks or the HTTP service. The Git PoC stores CR JSON server-side without cluster integration. Future authentication is supplied at the service transport/composition boundary, never embedded in feature components. The details configuration export serializes domain data locally and is not a raw Kubernetes YAML editor.

Model management now uses the same `/api/models` collection: GET list, POST create, and GET/DELETE `/api/models/{name}`. New models save deployment, registration, and ACM-style placement/distribution CRs automatically. `GET /api/locations` supplies the available unique location strings; creation requires a nonempty `locations` array, which both model GET endpoints return. See [model deployment UI](model-deployment-ui.md) and [OpenAPI](openapi.json).
