import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../api.mjs';
import { tenantInputSchema } from '../../shared/tenant-validation.mjs';
import { createModelSchema } from '../../shared/model-validation.mjs';
import { createSchema, updateSchema } from '../../shared/subscription-validation.mjs';
const api = createApi({snapshot() {throw new Error('Docs must not access storage');}});
const request = path => api(new Request(`http://localhost${path}`));

test('Swagger page and specification are served without accessing the repository', async () => {
  for (const path of ['/api/docs','/api/docs/']) {
    const response = await request(path);
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-type'),/^text\/html/);
    const html = await response.text();
    assert.match(html,/SwaggerUIBundle/);
    assert.match(html,/url: '\/api\/openapi.json'/);
    assert.match(html,/validatorUrl: null/);
  }
  const response = await request('/api/openapi.json');
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-type'),'application/json');
  const spec = await response.json();
  assert.equal(spec.openapi,'3.0.3');
  assert.equal(spec.servers[0].url,'/api');
  const operations = Object.entries(spec.paths).flatMap(([path,item]) =>
    Object.keys(item).filter(method => ['get','post','put','delete','patch'].includes(method)).map(method => `${method.toUpperCase()} ${path}`));
  assert.deepEqual(operations.sort(),[
    'GET /clusters','PATCH /clusters/{name}','GET /grid/overview',
    'GET /tenants','POST /tenants','GET /tenants/{name}','PUT /tenants/{name}','DELETE /tenants/{name}',
    'GET /health','GET /locations','GET /models','GET /subscriptions','POST /subscriptions',
    'GET /subscriptions/{name}','PUT /subscriptions/{name}','DELETE /subscriptions/{name}',
    'POST /models','GET /models/{name}','DELETE /models/{name}',
  ].sort());
  // Ensure all local schema and parameter references resolve.
  function checkRefs(value) {
    if (!value || typeof value !== 'object') return;
    if (value.$ref) {
      assert.ok(value.$ref.startsWith('#/'));
      let target = spec;
      for (const part of value.$ref.slice(2).split('/')) target=target?.[part];
      assert.ok(target,`Unresolved reference: ${value.$ref}`);
    }
    for (const child of Object.values(value)) checkRefs(child);
  }
  checkRefs(spec);
  const createExample=spec.paths['/subscriptions'].post.requestBody.content['application/json'].example;
  const updateExample=spec.paths['/subscriptions/{name}'].put.requestBody.content['application/json'].example;
  assert.ok(createSchema.safeParse(createExample).success,'Create example must pass actual API validation');
  assert.ok(updateSchema.safeParse(updateExample).success,'Update example must pass actual API validation');
  assert.ok(createModelSchema.safeParse(spec.paths['/models'].post.requestBody.content['application/json'].example).success);
  assert.ok(tenantInputSchema.safeParse(spec.paths['/tenants'].post.requestBody.content['application/json'].example).success);
  for (const method of ['put','delete']) {
    const operation = spec.paths['/subscriptions/{name}'][method];
    assert.equal(operation.parameters[0].$ref,'#/components/parameters/IfMatch');
    assert.ok(operation.responses['412']);
    assert.ok(operation.responses['428']);
  }
});
