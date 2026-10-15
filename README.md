# MaaS Administration Portal

Standalone React/TypeScript/PatternFly administration portal adapting OpenShift AI model/subscription screens and OSAC tenant/IdP onboarding. Supports browser-local mocks and a Git filesystem backend; no cluster or credentials required.

Requires Node.js >=22.18.0.

```bash
npm install
npm run dev
```

Open http://localhost:5173/clusters. Navigation is Clusters, Tenants, Models, Subscriptions. Clusters defaults to Git files when Hub settings are absent, with site1–site3 provisioned and site4 available to enroll. See [cluster modes and provisioning](docs/ai-grid-clusters.md). Create, view, edit and delete subscriptions; type group names, select models and configure token limits. Mock changes persist in localStorage under `maas-admin-subscriptions-v1`. To reset the fixtures, remove that key in browser developer tools.

```bash
npm test
npm run build
npm run typecheck
```

The service interface is `src/services/subscriptions/SubscriptionService.ts`. The composition root is `src/main.tsx`. Feature components call adapters/hooks, never fetch or Kubernetes clients. The standalone shell, notifications and naming helpers are separate from the extracted subscription feature.

To use the included Git backend, run:

```bash
npm run dev:git
```

This starts the backend and UI together, selects the HTTP service and proxies `/api`. The backend initializes a dedicated repository at `data/maas-git`, seeds model lookups, and writes subscription changes as CR JSON files without staging or committing them. You commit the changes yourself. These Git-backed resources are not pushed or applied. Cluster enrollment updates a Git ManagedCluster CR by default, or the configured live ACM Hub. Git must be available on PATH. See [Git backend setup and behavior](docs/git-backend.md) for configuration, file-only mode and running the processes separately.

Authentication remains deferred. A deployed frontend needs `/api` proxying and an SPA route fallback.

Tenant onboarding: choose **Create tenant**, enter name/domains, configure the OIDC identity provider in the second step, then review and save. Break-glass functionality is hidden. Tenant configuration is saved with its IdP in one operation; it does not connect to an IdP. See [tenant onboarding and API](docs/tenant-onboarding.md).

Analysis: [upstream UI](docs/upstream-subscription-ui.md), [API contract](docs/subscription-api-contract.md), [provenance](docs/upstream-provenance.json). Both upstream commits are pinned in the analysis. License and attribution are retained in LICENSE, NOTICE and source comments.

The subscription Configuration tab and creation-time authorization-policy option are hidden. New subscriptions always request a matching authorization policy and show Saved after creation. Deletion also removes the generated policy, allowing the same subscription name to be reused. Billing/metering, users, guardrails, inference scheduling priority and existing unlimited access are preserved but have no new editors. Subscription creation uses the upstream administrator form. Model deployments use an adapted model-serving wizard. The mock approximates reconciliation by returning stable statuses immediately; it does not simulate Kubernetes controllers.

Interactive REST documentation: run `npm run dev:git` and open http://127.0.0.1:5173/api/docs, or open the top-right gear menu and choose **REST API**. The downloadable [OpenAPI specification](docs/openapi.json) is served at `/api/openapi.json`. Swagger UI loads pinned CDN assets and needs internet access; **Try it out** calls the real local backend.

Model management: choose **Models** in the sidebar, then **Deploy model**. The five-step wizard includes location selection before review and saves an `LLMInferenceService`, matching `MaaSModelRef`, ACM-style `Placement` and linked `ManifestWorkReplicaSet` to Git. The model list shows a clickable location count; expanding it reveals the full location list in a row below. New models automatically become available in subscription forms. The deployment list supports filtering, sorting, pagination and typed deletion confirmation; referenced models cannot be deleted. New resources use the default `maas` namespace. See [model deployment extraction and scope](docs/model-deployment-ui.md).

The unified `/api/models` API supports listing and creation, with details/deletion at `/api/models/{name}`, including each model’s `locations` array. Namespace is configured only in the backend and is absent from REST URLs and payloads. `GET /api/locations` derives locations from Ready, provisioned AI Grid members (initially site1, site2, site3). Model management and subscription selection use the same list; `/api/deployments` has been removed. Existing catalog-only models remain visible with no invented deployment settings.

AI Grid cluster management: run `npm run dev:git` without Hub settings for Git CRs, or configure `ACM_HUB_URL`, `ACM_HUB_TOKEN_FILE`, and optionally `ACM_HUB_CA_FILE` for a live Hub. The Clusters page lists ACM ManagedClusters and adds `ai-grid/enabled: "true"` through a label-only merge patch. See [AI Grid cluster setup, API and RBAC](docs/ai-grid-clusters.md).

See [AI Grid overview and monitoring](docs/grid-monitoring.md) for site metadata, Thanos configuration, and the dashboard API.
