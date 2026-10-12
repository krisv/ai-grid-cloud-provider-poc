# ACM Hub clusters and AI Grid enrollment

**Clusters** is the first navigation item, followed by Tenants, Models, and Subscriptions. `/` opens `/clusters`. The table shows cluster name, availability, AI Grid membership, and action. It supports name filtering, sorting, pagination, manual refresh, and a 30-second refresh interval.

The browser calls the local backend. With no ACM Hub settings, it reads `ManagedCluster` CR JSON files from the Git repository. With Hub settings (or in-cluster configuration), it reads the live ACM Hub and follows all list pages. Both sources return the same cluster summaries, including availability, membership, location and provisioning state. Partial or invalid Hub configuration produces an error instead of silently switching to Git.

Provisioning completion is represented by the application label `ai-grid/provisioned: "true"`. An enrolled node without this marker displays **Provisioning**; a node that is not enrolled displays **Not provisioned**. Membership and successful provisioning are separate. This marker is an AI Grid convention, not an ACM built-in status.

Availability uses ACM's `ManagedClusterConditionAvailable`: `True` displays **Ready**, `False` displays **Offline**, and missing/`Unknown` displays **Unknown**. Membership requires the exact label `ai-grid/enabled: "true"`; absent labels and all other values display **Not enrolled**. These semantics follow the [OCM ManagedCluster API](https://pkg.go.dev/open-cluster-management.io/api/cluster/v1).

**Add to AI Grid** sets only the membership label. In Git mode it updates the cluster file atomically; in live mode it sends this fixed JSON merge patch to the Hub:

```http
PATCH /apis/cluster.open-cluster-management.io/v1/managedclusters/{name}
Content-Type: application/merge-patch+json

{"metadata":{"labels":{"ai-grid/enabled":"true"}}}
```

The [Kubernetes JSON merge-patch mechanism](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/update-api-object-kubectl-patch/) preserves other metadata labels. Enrollment is idempotent and also available for offline clusters. Pending requests disable that row's button. Successful enrollment confirms the saved membership label; failures retain the Add button and display a retryable row error. Enrolled rows show **Member** and **AI Grid Member**. Refresh reflects externally changed Hub labels.

## Default file mode and provisioning completion

Run `npm run dev:git` without ACM environment settings. The repository is seeded with:

| Cluster file | AI Grid | Provisioning | Availability | Deployment location |
| --- | --- | --- | --- | --- |
| `clusters/site1.json` | Member | Provisioned | Ready | site1 |
| `clusters/site2.json` | Member | Provisioned | Ready | site2 |
| `clusters/site3.json` | Member | Provisioned | Ready | site3 |
| `clusters/site4.json` | Not enrolled | Not provisioned | Ready | Not offered yet |

The files are under `data/maas-git` by default, and are real `cluster.open-cluster-management.io/v1` `ManagedCluster` manifest shapes, including labels and availability conditions. The PoC stores state but does not run provisioning automation.

To show site4 completing provisioning:

1. Click **Add to AI Grid** for site4. Its file gains `ai-grid/enabled: "true"` and the UI shows **Provisioning**.
2. In `data/maas-git/clusters/site4.json`, change `metadata.labels["ai-grid/provisioned"]` from `"false"` to `"true"`.
3. Ensure the `ManagedClusterConditionAvailable` condition in `status.conditions` has `status: "True"` (this is already true in the site4 fixture).
4. Click **Refresh** on Clusters, or wait for polling. Site4 shows **Provisioned** and appears in the model deployment locations when the wizard reloads.

The relevant final file fragment is:

```json
{
  "metadata": {
    "name": "site4",
    "labels": {
      "location": "site4",
      "ai-grid/enabled": "true",
      "ai-grid/provisioned": "true"
    }
  },
  "status": {
    "conditions": [{"type": "ManagedClusterConditionAvailable", "status": "True"}]
  }
}
```

Keep the other CR fields. Setting availability to `"False"` shows **Offline** and removes that location from deployment options if there is no other eligible node there. The default file-only mode does not stage or commit changes. If automatic commits are enabled, commit manual edits before using API mutations. Stop the backend while making multi-file manual edits. The `.maas-clusters.json` marker prevents reseeding on restart, so manual provisioning changes and intentionally deleted cluster files remain intact. Existing cluster catalogs are not overwritten during initialization. `MAAS_GIT_SEED=false` disables sample seeding.

## Deployment locations use the same node inventory

`GET /api/locations` returns unique `location` label values only from nodes where all three checks pass: **Ready**, `ai-grid/enabled: "true"`, and `ai-grid/provisioned: "true"`. Both Git and live ACM sources use these rules. A location remains available if at least one matching node is eligible. Model creation validates this inventory again before saving. `locations.json` is no longer used.

Model `Placement` CRs require the membership and provisioning labels, together with the selected `location` values. [ACM Placement selectors and availability taints](https://open-cluster-management.io/docs/concepts/content-placement/placement/) control cluster selection when these saved resources are applied to a Hub. A live provisioning process should set the provisioning label when its work completes; the portal's enrollment action does not set it automatically.

## Connect to your Hub

Use the Hub's Kubernetes API origin, not the ACM web-console URL. Configure backend environment variables:

| Variable | Purpose |
| --- | --- |
| `ACM_HUB_URL` | HTTPS Kubernetes API origin, for example `https://api.hub.example.com:6443` |
| `ACM_HUB_TOKEN_FILE` | Path to a file containing the backend bearer token; preferred over a shell token value |
| `ACM_HUB_TOKEN` | Optional bearer-token environment value when a token file is not configured |
| `ACM_HUB_CA_FILE` | Optional path to the Hub CA PEM file when its certificate is not trusted by system roots |

```bash
ACM_HUB_URL=https://api.hub.example.com:6443 \
ACM_HUB_TOKEN_FILE=/path/to/hub-token \
ACM_HUB_CA_FILE=/path/to/hub-ca.pem \
npm run dev:git
```

Omit `ACM_HUB_CA_FILE` when the Hub has a certificate trusted by the system. Certificate verification is always enabled. Token and CA files are read on each Hub request, supporting rotated token files. No `VITE_` credential variables are used, and credentials are not returned in browser JSON or forwarded from browser request headers.

When deployed on the ACM Hub without `ACM_HUB_URL`, the backend can use `KUBERNETES_SERVICE_HOST`, the HTTPS service port, and the mounted service-account token/CA at `/var/run/secrets/kubernetes.io/serviceaccount`. An explicitly configured external Hub requires explicitly configured credentials. Kubeconfig files and exec-auth plugins are not parsed by this adapter.

The backend token needs cluster-scoped access to list and patch ManagedClusters. An example ClusterRole for the Hub service account is:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: ai-grid-portal
rules:
  - apiGroups: [cluster.open-cluster-management.io]
    resources: [managedclusters]
    verbs: [list, patch]
```

Bind that role to the service account used by the backend. The portal remains an administrator application using its existing loopback API boundary; the ACM Hub authorizes the backend token. There is no additional per-user authentication layer in this PoC.

## Portal REST API

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/clusters` | Fetch ManagedClusters from the active Git/Hub source and return cluster summaries |
| PATCH | `/api/clusters/{name}` | Enroll the cluster; request body is exactly `{"aiGridEnabled":true}` |

Cluster-scoped resources need no namespace in URLs or payloads. The enrollment endpoint accepts neither arbitrary patch operations nor arbitrary labels. A Hub 401/403 reports backend credential/permission problems; 404 reports a missing cluster/API; 409 allows retry after refresh. Missing configuration, TLS/connection failures, malformed responses and request timeouts return 503. Upstream error bodies are not exposed, and failed listing is shown as an error rather than a false empty table. Hub redirects are not followed.

Enrollment updates the active source: the Git CR in default file mode, or the existing ManagedCluster on a configured Hub. Tenant, model and subscription saves remain Git-backed. `npm run dev` in browser-only mock mode requires the backend for cluster management; use `npm run dev:git` for file mode without Hub credentials.

Swagger is available through the gear menu or `/api/docs`. Tests use an injected Hub HTTP transport to verify the real request method/path, merge-patch body, credentials remaining server-side, label preservation, complete pagination, status mapping, error handling, token rotation and UI enrollment/retry/refresh. No live Hub is patched during tests.
