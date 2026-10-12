# Tenant onboarding and OIDC configuration

The Tenants feature adapts OSAC's tenant list, dynamic-domain onboarding form, and identity-provider wizard from `osac-project/osac` commit `8cb0a227e45cc9b17421b6e79ce493ed370ebd5d`. GitHub cloning failed because the environment could not resolve `github.com`; a local checkout with the same GitHub origin was cloned into `/tmp/osac-tenant-source` and used as the reference. Source mapping is recorded in [osac-provenance.json](osac-provenance.json).

Navigation is **Clusters → Tenants → Models → Subscriptions**, with tenant management at `/tenants`. Tenant names link to saved configuration details. The list retains OSAC's tenant name, status, primary domain, registration timestamp, search and deletion behavior, and adds the tenant's IdP summary and an edit action.

## Combined onboarding

1. **Tenant details:** name and dynamically added/removed domains. Domain entries must be valid DNS names and unique, including across saved tenants. An empty domain collection is supported, matching OSAC's initial form state.
2. **Identity provider:** optional title/description, required client ID and client-secret reference, issuer, authorization URL and token URL; optional default scopes, user-info URL, JWKS URL and logout URL; signature validation defaults to true. Only OIDC is supported. The client-secret reference is typed because this PoC has no secret catalog. Secret values are never requested or stored.
3. **Review:** inspect both configurations before saving. The backend receives a single request and saves tenant and IdP together. Canceling an unfinished wizard saves nothing. Later edits use the same flow with an immutable tenant name.

Break-glass controls, credential generation and the one-time credential modal are omitted. The backend does not accept a break-glass field. Saved tenants display **Saved**, not OSAC's live **Synced** status. No requests are sent to an IdP and no login realm, user, secret, or cloud resource is provisioned.

OSAC provides role-based administration/IdP-manager navigation and separate tenant/IdP APIs. This existing standalone portal has no authenticated session or server authorization layer; it continues as an administrator PoC. It does not emulate OSAC's role gating by hiding links alone. Authentication, live IdP integration and multiple IdPs per tenant remain outside this implementation.

## REST API

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/tenants` | Full tenant list with embedded OIDC configuration; empty list is `[]` |
| POST | `/api/tenants` | Save tenant and IdP configuration together; returns 201, Location and quoted ETag |
| GET | `/api/tenants/{name}` | Tenant details and quoted ETag |
| PUT | `/api/tenants/{name}` | Replace tenant domains and IdP configuration using quoted If-Match; name is immutable |
| DELETE | `/api/tenants/{name}` | Remove tenant and embedded IdP using quoted If-Match |

All URLs and public payloads use tenant name only. Namespace remains backend configuration. Duplicate tenant names or overlapping domains return 409; invalid input returns 422; missing/stale If-Match returns 428/412. Errors keep wizard input or deletion confirmation open. The [OpenAPI specification](openapi.json) includes schemas and a complete OIDC example; use the gear menu's REST API item for Swagger.

The simple request shape is:

```json
{
  "name": "tenant1",
  "domains": ["tenant1.example.com"],
  "identityProvider": {
    "title": "Tenant 1 SSO",
    "config": {
      "clientId": "tenant1-client",
      "clientSecretSecret": {"name": "tenant1-oidc-secret"},
      "issuer": "https://idp.example.com/realms/tenant1",
      "authorizationUrl": "https://idp.example.com/authorize",
      "tokenUrl": "https://idp.example.com/token"
    }
  }
}
```

## Storage and lifecycle

Git mode stores one file at `tenants/<default-namespace>/<name>.json`, containing domains and the complete nested IdP configuration. This is a PoC configuration record with `kind: Tenant` and `apiVersion: osac.portal/v1alpha1`, not an OSAC Kubernetes CRD or the upstream protobuf transport. It uses the existing Git store's atomic writes, transaction rollback, file-only default and opt-in local commits. No namespace is returned in REST data. Mock mode stores the same domain configuration in localStorage alongside models/subscriptions.

Tenant deletion removes its saved IdP configuration with it. Models, subscriptions and authorization policies remain independently managed: the PoC does not infer ownership from tenant-like group names or cascade deletion across those resources.

Tests exercise the full wizard and edit/delete flow against the real in-process HTTP backend, navigation order, hidden break-glass UI, conflict retention, retry, mock persistence, validation, stale revisions, rollback, and restart persistence.
