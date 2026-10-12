import { readFile } from 'node:fs/promises';
const specUrl = new URL('../docs/openapi.json', import.meta.url);
// Pinned Swagger UI distribution; API traffic and the specification stay on this origin.
const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MaaS PoC REST API</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css">
  <style>body{margin:0;background:#fafafa}nav{padding:16px;font-family:system-ui}#docs-error{padding:16px;font-family:system-ui;color:#a30000}</style>
</head>
<body>
  <nav><a href="/subscriptions">Back to subscriptions</a> · <a href="/api/openapi.json">Download OpenAPI specification</a></nav>
  <div id="docs-error" role="alert" hidden>Swagger UI could not load. Check your connection to unpkg.com, or download the OpenAPI specification above.</div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
  <script>
    if (typeof SwaggerUIBundle === 'function') {
      SwaggerUIBundle({
        url: '/api/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        displayRequestDuration: true,
        validatorUrl: null,
        presets: [SwaggerUIBundle.presets.apis],
        layout: 'BaseLayout'
      });
    } else {
      document.getElementById('docs-error').hidden = false;
    }
  </script>
</body>
</html>`;
export async function serveApiDocs(request) {
  if (request.method !== 'GET') return undefined;
  const path = new URL(request.url).pathname;
  if (path === '/api/openapi.json') {
    return new Response(await readFile(specUrl, 'utf8'), {
      headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'},
    });
  }
  if (path === '/api/docs' || path === '/api/docs/') {
    return new Response(html, {
      headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'},
    });
  }
  return undefined;
}
