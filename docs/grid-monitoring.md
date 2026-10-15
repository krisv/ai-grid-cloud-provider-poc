# AI Grid overview and monitoring

The **AI Grid** view shows enrolled clusters grouped geographically by site. **Monitoring** shows gateway request rate, gateway error rate (5xx), gateway p95 latency, and infrastructure GPU utilization. Inventory comes from the configured ACM Hub, or the existing Git-backed cluster inventory in local file mode. There is no application-health or GitOps-sync integration.

## Cluster metadata

Set site identity as a label on each Hub ManagedCluster. Coordinates and readable names are annotations. These keys are portal conventions. The existing `location` label continues to control model placement.

```yaml
metadata:
  name: brussels-cluster-1
  labels:
    ai-grid/enabled: "true"
    ai-grid/provisioned: "true"
    ai-grid/site: brussels-dc1
    ai-grid/region: europe-west
    location: brussels
  annotations:
    ai-grid/site-name: "Brussels Data Center 1"
    ai-grid/latitude: "50.8503"
    ai-grid/longitude: "4.3517"
```

Clusters at the same site should have matching coordinates and site names. Map markers represent individual clusters: Ready is green, Offline is red, Unknown is grey, and the selected cluster is blue. Selecting a marker opens cluster details in the persistent right-hand drawer. Co-located pins are slightly offset for selection. Clusters without valid coordinates remain in the table. The geographic view adapts the reference prototype’s Leaflet map, Esri light-grey basemap, right-hand cluster/model drawer, attention badges, and bottom inventory summary strip. The basemap requires access to server.arcgisonline.com. If tiles cannot load, a notice appears and pins plus the keyboard-accessible cluster list remain available. The UI shows all enrolled sites; searching or filtering availability inside the drawer filters the map/list. The toggle next to search switches between clusters and models. Cluster cards link to models whose saved placement locations match the cluster’s location label; model cards link back to matching sites/clusters. These are intended targets, not verified deployment readiness. Detailed model configuration and cluster metadata appear in the drawer with Back navigation. Metric charts appear only in Monitoring.

## Thanos configuration

Configure these on the backend, never as browser `VITE_` variables:

| Variable | Meaning |
| --- | --- |
| `THANOS_QUERY_URL` | Thanos Query HTTP(S) base URL; an optional path prefix is supported |
| `THANOS_TOKEN_FILE` | Optional file containing a bearer token, read on each query |
| `THANOS_REQUESTS_QUERY` | Override fleet gateway request rate query |
| `THANOS_ERRORS_QUERY` | Override gateway 5xx error rate query |
| `THANOS_LATENCY_QUERY` | Override p95 latency query; return milliseconds |
| `THANOS_GPU_QUERY` | Override GPU utilization query; return percentage 0–100 |

The initial assumed metric contract uses `ai_gateway_requests_total`, `ai_gateway_request_duration_seconds_bucket`, and `DCGM_FI_DEV_GPU_UTIL`. These are configurable assumptions, not automatically discovered metrics. The gateway counter's `status` label is assumed to contain HTTP status codes. Metrics must have a `cluster` label matching ManagedCluster names. Infrastructure GPU telemetry must carry this cluster identity too.

Each query should return **one aggregate series** for the selection. Put `__CLUSTERS__` in the query where a quoted regex matcher belongs. The backend substitutes escaped selected cluster names. For example:

```promql
sum(rate(ai_gateway_requests_total{cluster=~__CLUSTERS__}[5m]))
```

Metric overrides must preserve cluster scoping. Request and error rates sum traffic; latency aggregates histogram buckets before computing p95; GPU utilization averages the reporting GPUs. This GPU metric describes measured utilization, not allocation or GPU capacity.

The backend queries `/api/v1/query_range` with roughly 60 intervals, a ten-second timeout, redirects disabled, and partial responses disabled. Individual metric errors do not hide inventory. Missing samples from a configured Thanos are never converted into zero or inferred as healthy. When THANOS_QUERY_URL is absent, deterministic demo series are generated for the selected available clusters and range. Per-cluster traffic uses a baseline plus independently seeded random offsets at each measurement and occasional random spikes; no periodic wave functions are used. GPU utilization follows recent traffic with a short lag and a saturation ceiling; error rates and latency increase during load pressure. Site traffic sums into fleet traffic, and fleet GPU utilization averages reporting clusters. Samples at the same timestamp stay consistent across ranges. Offline clusters do not produce synthetic telemetry. The response marks metricsSource as demo and Monitoring displays an explicit simulation banner. A configured Thanos query failure never triggers demo fallback. It uses normal platform TLS trust; install private CAs into the backend runtime trust configuration if needed.

## API and demo mode

`GET /api/grid/overview?range=1h&site=brussels-dc1`

`range` accepts `1h`, `6h`, or `24h`; `site` is optional. `metrics=false` skips metric generation and queries; AI Grid uses this inventory-only mode. Only enrolled clusters are included. The response contains `updatedAt`, `inventorySource`, `demo`, `metricsSource`, `clusters`, and `metrics`. Each metric includes its unit, sample timestamps, and status (`ok`, `not-configured`, `unavailable`, or `no-data`). Inventory retrieval errors fail the request; metrics fail independently. Site-filtered requests constrain both inventory and metric queries.

Browser-only mock mode provides three sample sites and simulated metric series, explicitly labelled demo data. HTTP mode uses backend inventory and Thanos when configured; otherwise it uses explicitly labelled simulated metrics. Existing Git data requires site labels and coordinate annotations to appear on the map. Refresh is manual in this first version; chart timestamps show sample age.

## Observability layout

Monitoring follows the cloned prototype's Observability dashboard with **Cluster**, **Models**, and **Usage** tabs. The header has time-period buttons, the overview has compact tiles, and collapsible sections contain colored area charts and tables. The site selector has been removed; the UI always shows all enrolled sites. The optional site parameter remains available in the API.

Overview request totals and success rates are integrated over the selected window; GPU utilization is averaged across window samples. Current ACM availability counts do not represent historical availability.

Models includes a deployment selector plus charts for request queue length, replica count, p90 end-to-end latency, p90 TTFT, token throughput, and KV cache usage. In simulation mode, these profiles derive from selected fleet traffic, model identity, and replica configuration. Selecting a model changes its share of traffic and performance profile. These are demo measurements, not proof of running deployments. When real Thanos is configured, model telemetry remains explicitly unavailable until its queries are wired.

Usage follows the reference with stacked tenant token consumption and a tenant usage table. Tenant identities are loaded from the tenant API, using the same records as the Tenants page (including coca-cola and pepsi in the supplied local dataset). No tenant identities are embedded in the chart. Uncached input, output, and cached input tokens derive from integrated per-tenant simulated traffic for the selected window. Traffic shares, prompt sizes, output lengths and cache fractions vary by tenant and timestamp, so normalized proportions vary across timeframes. Cached input is separated from uncached input and counted once in total consumption. The chart auto-scales and displays all three stacked categories with numeric totals. Quota utilization is omitted because no authoritative tenant quota and accounting period are configured. Actual tenant billing or quota data is not inferred. Real Thanos mode shows tenant telemetry as unavailable until the corresponding integration is configured.

Simulation helpers live in the monitoring service layer, separate from chart presentation. Both browser demo and backend fallback share the same noise-based traffic generator. Timestamp-keyed random offsets preserve overlapping samples across requests and ranges; GPU usage correlates with traffic without a periodic wave. Time-period and site changes load metrics independently of inventory and discard superseded responses.
