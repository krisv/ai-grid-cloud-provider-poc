# Standalone model deployment UI

The model list and wizard are adapted from Open Data Hub Dashboard commit `8051fbbea117457b4da4074fb2856b732e6677a4`, using `packages/model-serving/` rather than the MaaS governance overview. Original paths are recorded in the source and in `upstream-provenance.json`.

| Upstream source | Standalone behavior |
| --- | --- |
| `src/components/global/GlobalDeploymentsView.tsx` and `src/components/deployments/DeploymentsTable.tsx` | Models navigation, loading/retry/empty states, name filtering, sorting/pagination and deletion action. Cluster health, endpoint and hardware-profile columns are replaced by saved configuration and Git status. |
| `src/components/deploymentWizard/ModelDeploymentWizard.tsx` and `steps/ModelSourceStep.tsx`, `steps/ModelDeploymentStep.tsx`, `steps/ReviewStep.tsx` | Retains the Model details, Model deployment, Advanced settings, Locations and Review sequence. Uses the existing extracted naming fields and typed URI, image, resource and replica settings instead of cluster/plugin catalogs. |
| `src/components/deploymentWizard/fields/RuntimeArgsField.tsx` | Extracted additional runtime arguments editor, including comment filtering and predefined-arguments help. |
| Existing extracted MaaS `DeleteModal.tsx` | Typed name confirmation with loading/error handling. |
| `packages/llmd-serving/src/deployments/deploy.ts`, `model.ts` | Backend assembles an `LLMInferenceService` with `serving.kserve.io/v1alpha2`, model URI/name, replicas and main container settings. Additional arguments use `VLLM_ADDITIONAL_ARGS`. |
| `packages/maas/frontend/src/odh/modelServingExtensions/modelDeploymentWizard/maasDeploymentTransformer.ts` | Automatic MaaS publication uses `maas-default-gateway` in `openshift-ingress`. The standalone backend also writes a matching `MaaSModelRef` atomically. |

## Scope

Run `npm run dev:git` and open `/models`. The wizard at `/models/deploy` supports generative `LLMInferenceService` deployments with a typed model URI and runtime image. New resources use `MAAS_NAMESPACE`, default `maas`; users do not select a project. Namespace is internal backend configuration and is omitted from URLs, request bodies and response data. Model operations and subscription selection use the configured default namespace. Catalog resources in other namespaces are excluded.

Saving writes `deployments/<namespace>/<name>.json` and, automatically, `models/<namespace>/<name>.json`. New models appear immediately in subscription model selection. Changes use the existing file-only/automatic-commit mode. Nothing is pushed, applied or queried from a cluster. The UI reports **Saved to Git** rather than a live deployment state.

The full upstream wizard also supports predictive models, serving platform plugins, distributed topology, cluster runtime/hardware catalogs, secrets/connections, environment variables and YAML editing. Those are outside this Git PoC's current deployment flow. Source URIs may reference existing PVCs or external storage, but credentials and cluster prerequisites are not created or validated. Deployment manifests follow the pinned dashboard shape; compatibility with a particular installed cluster API still needs validation before applying them.

Existing example MaaS catalog entries do not have deployment CRs, so they remain available to subscriptions with no invented deployment settings. The model list shows both saved deployments and existing catalog entries.

Deletion removes the deployment, registrations referencing that `LLMInferenceService`, and its placement/distribution resources in the same namespace, atomically. It is refused if any stored subscription or policy references one of those registrations, including resources outside the portal default namespace. Resolve those dependencies first; policies remain independently managed Git files. `If-Match` protects deployment, registration, placement and workload distribution content against stale deletion.

Mock mode also supports creation/deletion and persists deployments/catalog changes alongside subscriptions in localStorage. Older stored mock data without these collections falls back to the existing fixture catalog.

## Location placement

The Locations step is immediately before Review and requires at least one selection. `GET /api/locations` returns unique location labels from Ready, provisioned AI Grid members, using the active Git or ACM Hub cluster inventory. An empty eligible inventory prevents model creation until a node is enrolled, provisioned and Ready. Creation rejects duplicates and locations without an eligible node. The separate `locations.json` catalog has been retired. Existing models without placement return `locations: []` and display a dash.

Location selection stays in `POST /api/models` as `locations: ["site1", "site2"]`, and both model GET endpoints return it. There is no separate model-placement API. The model list shows a clickable location count and can filter by location. Clicking the count expands a row with the full location list, matching the subscription table.

Alongside the deployment and registration, the backend writes:

- `placements/<namespace>/<name>.json`: `cluster.open-cluster-management.io/v1beta1` `Placement`, requiring `ai-grid/enabled: "true"` and `ai-grid/provisioned: "true"` in `matchLabels`, with `spec.predicates[].requiredClusterSelector.labelSelector.matchExpressions` using `{key: "location", operator: "In", values: [...]}`. No cluster count is specified, so all eligible matching clusters are selected.
- `manifest-work-replica-sets/<namespace>/<name>.json`: `work.open-cluster-management.io/v1alpha1` `ManifestWorkReplicaSet`, referencing that Placement with rollout strategy `All` and embedding the `LLMInferenceService` under `spec.manifestWorkTemplate.workload.manifests`.

These follow the [OCM Placement](https://open-cluster-management.io/docs/concepts/content-placement/placement/) and [ManifestWorkReplicaSet](https://open-cluster-management.io/docs/concepts/work-distribution/manifestworkreplicaset/) schemas. Placement selects clusters; ManifestWorkReplicaSet distributes the workload. The PoC only saves these resources to Git. Applying them later requires ACM/OCM controllers (including the alpha ManifestWorkReplicaSet feature), a ManagedClusterSet bound to the placement namespace, matching ManagedCluster `location` labels, the destination namespace, and the model-serving CRD/runtime prerequisites on the target clusters.

All four resources are created/deleted in the same file transaction. Revisions include their contents, so external placement or workload edits invalidate a stale deletion. Mock mode stores selected locations with model deployments in localStorage and uses the default catalog.

## REST endpoints

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/locations` | Unique available location strings |
| GET | `/api/models` | List models, locations and revisions for management and subscription selection |
| POST | `/api/models` | Save deployment, registration and placement resources atomically; 201, ETag and Location |
| GET | `/api/models/{name}` | Get a model and quoted ETag |
| DELETE | `/api/models/{name}` | Delete with quoted If-Match; 204, 409 when referenced, 412 when stale, 428 when missing |

`GET /api/models` is the unified list used by model management and subscription forms. There is no separate deployments API or publication choice. New models always save deployment, registration and placement resources. Legacy unpublished deployment files remain visible for management with `availableForSubscriptions: false`; they are not offered to subscriptions. Request bodies, response schemas, examples and errors are documented in [OpenAPI](openapi.json) and Swagger UI at `/api/docs`.

Tests drive the wizard and deletion dialog through the HTTP service and real backend in process, inspect all saved CRs, confirm model-selection integration and retained deletion conflicts, and cover mock persistence. Backend checks cover duplicate/invalid input, missing/stale revisions, registration changes, foreign-namespace dependencies, persistence across restart and rollback if registration storage fails.
