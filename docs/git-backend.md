# Git filesystem backend PoC

The backend implements the domain API in [subscription-api-contract.md](subscription-api-contract.md) and stores actual MaaS resources in a dedicated local Git repository. No cluster, Kubernetes client, authentication service or remote Git server is required. The Git storage flows never push, pull or apply resources. The Clusters API uses Git ManagedCluster CRs by default, or reads and patches a configured ACM Hub.

## Run the UI against the backend

Requires the existing `npm install`, Node.js >=22.18.0 and Git available on PATH. No additional packages are needed.

```bash
npm run dev:git
```

This starts the API at `http://127.0.0.1:8080/api`, then starts Vite with the HTTP service selected. Open the Vite URL shown in the terminal (normally http://localhost:5173/clusters). The Vite `/api` proxy keeps browser requests on the UI origin. Process environment values select HTTP even if `.env.local` previously selected mocks. Ctrl+C stops both processes.

The default data repository is `data/maas-git`, ignored by the portal source repository. On first start the backend initializes Git and seeds example model lookup resources. Subscription and authorization-policy collections start empty. Create a subscription in the UI, type a group name, choose a model, add a token limit, and save. The corresponding subscription and optional matching policy appear in the repository as working-tree files. No files are staged or committed by default.

To run the two processes separately:

```bash
npm run backend
# In another terminal:
VITE_SUBSCRIPTION_SERVICE=http npm run dev
```

The existing `npm run dev` without HTTP configuration still uses browser-local mocks. Mock localStorage records are not imported into the Git backend.

## Configuration

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `MAAS_GIT_DIR` | `data/maas-git` | Dedicated repository directory; initially empty or already initialized by this PoC |
| `MAAS_NAMESPACE` | `maas` | Subscription/policy storage namespace; fixed in the repository marker |
| `MAAS_GIT_AUTO_COMMIT` | `false` | Leave changes for manual commits; set to `true` to opt into automatic commits |
| `MAAS_GIT_SEED` | `true` | Set to `false` to initialize without example model/group files; applies only at first initialization |
| `MAAS_API_HOST` | `127.0.0.1` | API bind address |
| `MAAS_API_PORT` | `8080` | API port |
| `MAAS_API_TARGET` | host/port above | Optional Vite proxy override when the API runs elsewhere |

Example:

```bash
MAAS_GIT_DIR=/tmp/my-maas-resources MAAS_NAMESPACE=maas npm run dev:git
```

Commit the files yourself when ready, for example:

```bash
git -C data/maas-git add .
git -C data/maas-git commit -m "Update MaaS subscription resources"
```

Use your usual Git author configuration for manual commits. Automatic commits are opt-in (`MAAS_GIT_AUTO_COMMIT=true`) and use a command-scoped `MaaS Admin PoC <maas-admin@localhost>` identity; your global Git configuration is unchanged. To inspect history:

```bash
git -C data/maas-git log --oneline
git -C data/maas-git show HEAD
```

## Repository layout and CR mapping

```text
.maas-store.json
.maas-clusters.json
clusters/<cluster-name>.json
tenants/<namespace>/<tenant-name>.json
models/<project>/<model-name>.json
deployments/<namespace>/<model-name>.json
placements/<namespace>/<model-name>.json
manifest-work-replica-sets/<namespace>/<model-name>.json
subscriptions/<namespace>/<subscription-name>.json
authorization-policies/<namespace>/<subscription-name>-policy.json
```

Very long resource names use a hashed filename to fit filesystem filename limits; the original name remains in metadata. The marker records the format and configured namespace. An unrelated nonempty directory is refused rather than adopted.

JSON files are valid Kubernetes manifest format. A saved subscription resembles:

```json
{
  "apiVersion": "maas.opendatahub.io/v1alpha1",
  "kind": "MaaSSubscription",
  "metadata": {
    "name": "engineering",
    "namespace": "maas",
    "annotations": {
      "openshift.io/display-name": "Engineering",
      "maas-admin.portal/created-at": "2026-10-09T12:00:00.000Z"
    }
  },
  "spec": {
    "priority": 10,
    "owner": { "groups": [{ "name": "engineering" }] },
    "modelRefs": [{
      "name": "granite-3-8b",
      "namespace": "genai",
      "tokenRateLimits": [{ "limit": 1000, "window": "1h" }]
    }]
  }
}
```

Display names/descriptions become the upstream OpenShift annotations. Priority, owner, model references, token metadata, guardrails and inference priority become spec fields. Lookup presentation fields and API revisions are not written into spec. Unlimited references omit tokenRateLimits in CR JSON and normalize to an empty array in the UI. Existing labels, annotations, unknown spec fields, owner users, billing and guardrails survive unrelated updates. Empty description from the edit form clears its annotation.

Creating a matching policy uses the upstream `-policy` suffix, the same groups/models, and optional metering metadata. Because that suffix must fit the 253-character resource-name limit, creation with a policy requires a subscription name of at most 246 characters. Editing subscriptions leaves policy contents unchanged. Deleting a subscription atomically removes its automatically generated matching policy; independently managed policies remain. Generated policies carry a `maas-admin.portal/subscription` ownership annotation. Legacy policies are recognized by the exact generated description and the portal creation timestamp. Re-creating a subscription can replace its orphaned generated policy left by earlier versions, using the new groups and models. A colliding independently managed policy still returns 409.

The model catalog stores MaaSModelRef CRs with `spec.modelRef`. Users type group names directly; the backend does not discover or validate whether those groups exist. Existing group catalog files are ignored.

To change catalog resources manually, stop the backend, edit/add valid `.json` manifests under these folders, and commit them before restarting automatic-commit mode. Public model identity is name only. The backend restricts model operations to its configured default namespace and injects namespace into CR metadata and references; REST requests and responses never contain it. Subscription and policy APIs are scoped to the configured namespace. This PoC reads one JSON resource per file; YAML and multi-document imports are not implemented.

## Transactions and revisions

Reads and mutations are serialized within the process and guarded by a repository lock across backend processes. Changed files are replaced using atomic renames. By default, a successful create (subscription plus policy), update or deletion only changes files. With automatic commits explicitly enabled, each operation makes a single local commit. Failed writes/commits restore the previous files and index. The API returns success only after the file transaction (and opt-in commit) completes. Identical updates do not create empty commits in automatic mode.

Revisions are SHA-256 content digests, returned through the domain object and ETag. Update/delete require a quoted If-Match revision. Missing revision yields 428; stale revision yields 412. Changes made outside the API also change the content revision. Automatic commit mode refuses uncommitted work with 409, so it does not absorb unrelated manual changes. File-only mode does not stage or commit anything, including initial seed files.

This is a single-machine PoC, not a distributed transactional store. Stop the backend before manual file edits. A process crash during a multi-file operation may leave a dirty working tree; inspect and resolve it before restarting writes. File-only mode can restart with uncommitted files; automatic mode refuses further mutations until the working tree is clean. If a crashed process leaves `.git/maas-admin.lock`, remove that lock only after verifying no backend process is running. Symlinks in managed directories are refused.

## API and UI behavior

Implemented: list/get/create/update/delete subscriptions; list/create/get/delete models with automatic atomic deployment and MaaS registration; model lookups and location placement; `GET /api/locations`; and `GET /api/health`. Request bodies and response DTOs match the existing HttpSubscriptionService. The shared validation module is consumed by both the frontend mocks and real backend. Runtime validation checks names, groups, unique model references, rate-limit bounds and optional controller fields.

Domain errors use JSON `{code,message,fieldErrors?}`. Messages are deliberately user-safe; filesystem/Git details remain in backend logs. The HTTP client renders those messages and keeps unsaved input or the delete dialog on failure.

The API reports subscriptions as Saved with a Git-only explanation. It does not claim that models are deployed or that policies are enforced: there is no controller or cluster reconciliation. Authentication remains outside this milestone; the API binds to loopback by default. For a production frontend build, configure your web server to proxy `/api` to this backend and provide an SPA fallback.

## Verification

```bash
npm test
npm run test:backend
npm run build
```

Backend tests use temporary real Git repositories to verify manifest serialization, persistence across restarts, atomic policy creation, preserved fields, local commits, stale revisions, concurrent requests, rollback after failed commits, manual-commit mode, path handling and malformed resources. UI integration tests drive the extracted forms through HttpSubscriptionService and the actual backend request handler, inspect the saved CR files and unstaged working tree, and check conflicts. Those tests use Request/Response transport in process, so they can run in a sandbox that cannot bind localhost sockets.

## Interactive REST documentation

Run `npm run dev:git`, then open [Swagger UI](http://127.0.0.1:5173/api/docs) or open the portal's top-right gear menu and choose **REST API**. The backend also serves it directly at `http://127.0.0.1:8080/api/docs`.

The OpenAPI 3.0 specification lives in `docs/openapi.json` and is served at `/api/openapi.json`. It documents all eighteen domain operations; removed groups and authorization-policy list endpoints are excluded. Swagger UI's **Try it out** sends real requests to the same-origin `/api` backend. Start with `GET /models` to select model references, and copy the complete quoted `ETag` from subscription details into `If-Match` before updating or deleting.

The viewer loads pinned Swagger UI 5.11.0 JavaScript and CSS from unpkg.com and requires internet access. The specification and API traffic remain on the local app, and the external Swagger validator is disabled. Documentation remains accessible if the Git repository is unavailable.

Model deployments: the **Models** sidebar entry opens the adapted deployment list and wizard. See [model-deployment-ui.md](model-deployment-ui.md) for extraction scope, CR storage, endpoints and deletion dependencies.

Tenant onboarding: the **Tenants** sidebar item opens tenant management. Tenant and OIDC configuration use one Git record per tenant and a simple REST CRUD API; see [tenant-onboarding.md](tenant-onboarding.md).

Live cluster management: **Clusters** is the default landing page and uses Git ManagedCluster CRs by default and the ACM Hub API when configured. See [ai-grid-clusters.md](ai-grid-clusters.md) for Hub URL, token/CA files, in-cluster configuration and label PATCH behavior.
